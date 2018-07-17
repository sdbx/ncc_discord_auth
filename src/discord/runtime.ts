import * as Discord from "discord.js";
import { EventEmitter } from "events";
import { sprintf } from "sprintf-js";
import Config from "../config";
import Log from "../log";
import Ncc from "../ncc/ncc";
import Lang from "./lang";
import Ping from "./module/ping";
import Plugin from "./plugin";
import { CommandHelp, CommandStatus, Keyword, ParamType } from "./runutil";

const queryCmd = /\s+\S+/ig;
const safeCmd = /(".+?")|('.+?')/i;

export default class Runtime extends EventEmitter {
    private cfg = new Bot();
    private lang = new Lang();
    private client:Discord.Client;
    private ncc:Ncc;
    private plugins:Plugin[] = [];
    constructor() {
        super();
        // ,new Auth(), new Login()
        this.plugins.push(new Ping());
        // event register
        this.plugins.forEach(((v,i) => {
            this.on("ready",v.ready.bind(v));
            this.on("message",v.onMessage.bind(v));
        }));
    }
    public async start():Promise<string> {
        // load config
        await this.cfg.import(true).catch((err) => null);
        // init client
        this.client = new Discord.Client();
        // create ncc - not authed
        this.ncc = new Ncc();
        // init lang
        this.lang = new Lang();
        // ncc test auth by cookie
        try {
            if (await this.ncc.loadCredit() != null) {
                Log.i("Runtime-ncc","login!");
            } else {
                Log.i("Runtime-ncc", "Cookie invalid :(");
            }
        } catch (err) {
            Log.e(err);
        }
        this.client.on("ready",this.ready.bind(this));
        this.client.on("message",this.onMessage.bind(this));
        // client login (ignore)
        this.client.login(this.cfg.token)
        return Promise.resolve("");
    }
    public async destroy() {
        this.client.removeAllListeners();
        await this.client.destroy();
        this.ncc.chat.disconnect();
        return Promise.resolve();
    }
    protected async ready() {
        // init plugins
        for (const plugin of this.plugins) {
            plugin.init(this.client, this.ncc, this.lang);
        }
        this.emit("ready");
    }
    protected async onMessage(msg:Discord.Message) {
        const text = msg.content;
        const prefix = this.cfg.prefix;
        // onMessage should invoke everytime.
        this.emit("message",msg);
        // await Promise.all(this.plugins.map((value) => value.onMessage.bind(value)(msg)));
        // chain check
        for (const plugin of this.plugins) {
            if (await plugin.callChain(msg,msg.channel.id, msg.author.id)) {
                // invoked chain.
                return Promise.resolve();
            }
        }
        // command check
        if (!prefix.test(text)) {
            return Promise.resolve();
        }
        let chain = msg.content;
        // zero, remove \" or \'..
        chain = chain.replace(/\\('|")/igm,"");
        chain = chain.replace(prefix,"");
        // first, replace "" or '' to easy
        const safeList:string[] = [];
        while (safeCmd.test(chain)) {
            const value = chain.match(safeCmd)[0];
            safeList.push(value.substring(value.indexOf("\"") + 1, value.lastIndexOf("\"")));
            chain = chain.replace(safeCmd,"${" + (safeList.length - 1) + "}");
        }
        // second, chain..
        let pieces:Keyword[] = [];
        let cacheWord:string[] = [];
        for (const piece of chain.match(queryCmd)) {
            const split = Object.entries(ParamType)
            .map((value) => [value[0],value[1].split("/")] as [string,string[]]).map((value) => {
                let check:Keyword = null;
                const [_typeN, _suffix] = value;
                for (const _value of _suffix) {
                    if (piece.endsWith(_value)) {
                        // match suffix
                        check = {
                            type: ParamType[_typeN],
                            str: piece.substring(0,piece.lastIndexOf(_value)),
                        };
                        break;
                    }
                }
                return check;
            }).filter((value) => value != null);
            let part;
            // select correct data
            if (split.length >= 1) {
                part = split[0].str;
            } else {
                part = piece;
            }
            safeList.forEach((value, index) => {
                part = part.replace(new RegExp("\\$\\{" + index + "\\}", "i"), value);
            });
            cacheWord.push(part);
            if (split.length >= 1) {
                // commit
                const key = {
                    type: split[0].type,
                    str: cacheWord.join("").trim(),
                    query: cacheWord
                } as Keyword;
                pieces.push(key);
                cacheWord = [];
            }
        }
        const _cmds = pieces.reverse().filter((v) => v.type === ParamType.do);
        // cmd exists?
        let cmd:string = null;
        if (_cmds.length >= 1) {
            cmd = _cmds[0].str;
            pieces = pieces.reverse().filter((v) => v.type !== ParamType.do).reverse();
        } else {
            // no exists :(
            cmd = cacheWord.join("").trim();
        }
        /*
          * hard coding!
        */
        if (await this.hardCodingCmd(msg,cmd,pieces)) {
            return;
        }
        await Promise.all(this.plugins.map((value) => value.onCommand.bind(value)(msg, cmd, pieces)));
    }
    private async hardCodingCmd(msg:Discord.Message, cmd:string, pieces:Keyword[]):Promise<boolean> {
        let result = false;
        const helpCmd = new CommandHelp("알려,도움,도와,도움말",this.lang.helpDesc,true);
        helpCmd.addField(ParamType.dest, "알고 싶은 명령어",false);
        const setCmd = new CommandHelp("설정",this.lang.sudoNeed, false);
        setCmd.addField(ParamType.dest, "목적", true);
        setCmd.addField(ParamType.to, "설정값", true);
        /*
            Help Command
        */
        const _help = helpCmd.test(cmd,pieces);
        if (!result && _help.match) {
            let dest = "*";
            if (_help.exist(ParamType.dest)) {
                dest = _help.get(ParamType.dest);
                if (dest.endsWith("명령어")) {
                    dest = dest.substring(0,dest.lastIndexOf("명령어") - 1).trim();
                }
                if (dest.length < 1) {
                    dest = "*";
                }
            }
            if (dest != null) {
                const helps:CommandHelp[] = [];
                if (dest === "*") {
                    helps.push(helpCmd,setCmd);
                }
                this.plugins.map((_v) => _v.help).forEach((_v,_i) => {
                    _v.forEach((__v,__i) => {
                        if (dest !== "*") {
                            if (__v.cmds.indexOf(dest) >= 0) {
                                helps.push(__v);
                            }
                        } else {
                            helps.push(__v);
                        }
                    });
                });
                if (helps.length === 0) {
                    await msg.channel.send(sprintf(this.lang.helpNoExists,{help:dest}));
                } else {
                    for (let i = 0; i < Math.ceil(helps.length / 20); i += 1) {
                        const richMsg = new Discord.RichEmbed();
                        richMsg.setTitle(this.lang.helpTitle);
                        richMsg.setAuthor(getNickname(msg), msg.author.avatarURL);
                        for (let k = 0; k < Math.min(helps.length - 20 * i, 20); k += 1) {
                            richMsg.addField(helps[i * 20 + k].title, helps[i * 20 + k].description);
                        }
                        await msg.channel.send(richMsg);
                    }
                }
                result = true;
            }
        }
        /**
         * Config command
         */
        const _set = setCmd.test(cmd,pieces);
        if (!result && _set.match) {
            Log.json("설정",_set);
        }
        return Promise.resolve(result);
    }
    private filterEmpty(value:string):boolean {
        return value.length >= 1;
    }
}
export function getNickname(msg:Discord.Message) {
    if (msg.channel.type !== "dm") {
        const gn = msg.guild.member(msg.author).nickname;
        return gn != null ? gn : msg.author.username;
    } else {
        return msg.author.username;
    }
}
class Bot extends Config {
    public textWrong = "잘못됐다냥!";
    public token = "Bot token";
    protected prefixRegex = (/^(네코\s*메이드\s+)?(프레|레타|프레타|프렛땨|네코|시로)(야|[짱쨩]아?|님)/).source;
    constructor() {
        super("bot");
        this.blacklist.push("prefix");
    }
    public get prefix():RegExp {
        return new RegExp(this.prefixRegex,"i");
    }
    public set prefix(value:RegExp) {
        this.prefixRegex = value.toString();
    }
}