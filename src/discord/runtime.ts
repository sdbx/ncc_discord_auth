import * as Discord from "discord.js";
import Config from "../config";
import Plugin, { WordPiece } from "./plugin";

import Ncc from "../ncc/ncc";
import Auth from "./module/auth";
import Ping from "./module/ping";

const expDest = /.+?(을|를|좀)\s+/i;
const expCmd = /[\w가-힣]+(줘|해)/ig;
const expCmdSuffix = /(해|줘|해줘)/ig;

const queryCmd = /\s+\S+/ig;
const safeCmd = /(".+?")|('.+?')/i;
const ends_str:string[][] = ["을/를","에게/한테","으로/로","에서","해줘/해/줘"].map((value) => value.split("/"));
const ends_type = ["dest","for","to","from","do"];
export default class Runtime {
    private cfg = new Bot();
    private client:Discord.Client;
    private ncc:Ncc;
    private plugins:Plugin[] = [];
    constructor() {
        this.plugins.push(new Ping(),new Auth());
    }
    public async start():Promise<string> {
        // load config
        await this.cfg.import(true).catch((err) => null);
        // init client
        this.client = new Discord.Client();
        // create ncc - not authed
        this.ncc = new Ncc();
        // init plugins
        for (const plugin of this.plugins) {
            plugin.init(this.client, this.ncc);
            this.client.on("ready", plugin.ready.bind(plugin));
        }
        this.client.on("message",this.onMessage.bind(this));
        // client login (ignore)
        this.client.login(this.cfg.token)
        return Promise.resolve("");
    }
    protected async onMessage(msg:Discord.Message) {
        const text = msg.content;
        const prefix = this.cfg.prefix;
        if (!prefix.test(text)) {
            await Promise.all(this.plugins.map((value) => value.onMessage.bind(value)(msg)));
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
        let pieces:WordPiece[] = [];
        let cacheWord = [];
        for (const piece of chain.match(queryCmd)) {
            const split = ends_str.map((value, index) => {
                let check:WordPiece = null;
                for (const _value of value) {
                    if (piece.endsWith(_value)) {
                        // match suffix
                        check = {
                            type: ends_type[index],
                            str: piece.substring(0,piece.lastIndexOf(_value)),
                        };
                        break;
                    }
                }
                // return replaced string(remove suffix)
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
                pieces.push({
                    type: split[0].type,
                    str: cacheWord.join("").trim(),
                } as WordPiece);
                cacheWord = [];
            }
        }
        const _cmds = pieces.reverse().filter((v) => v.type === "do");
        // cmd exists?
        let cmd:string = null;
        if (_cmds.length >= 1) {
            cmd = _cmds[0].str;
            pieces = pieces.reverse().filter((v) => v.type !== "do");
        } else {
            // no exists :(
            cmd = cacheWord.join("").trim();
        }
        await Promise.all(this.plugins.map((value) => value.onCommand.bind(value)(msg, cmd, pieces)));
        /*
            params.say = chain.match(prefix)[0];
            chain = chain.replace(prefix,"");
            // test destination
            if (expDest.test(chain)) {
                params.dest = chain.match(expDest)[0].trim().split(" ").filter(this.filterEmpty)
                chain = chain.replace(expDest,"");
            }
            // test command
            if (expCmd.test(chain)) {
                const cmdarr = chain.match(expCmd);
                params.cmd = cmdarr[cmdarr.length - 1];
                chain = chain.replace(expCmd, "");
            } else {
                params.cmd = chain.substr(chain.lastIndexOf(" ")).trim();
                chain = chain.substring(0,chain.lastIndexOf(" ") + 1);
            }
            // cmd replace
            const cmdSf = params.cmd.match(expCmdSuffix);
            if (cmdSf != null) {
                params.cmd = params.cmd.substring(0,params.cmd.lastIndexOf(cmdSf[cmdSf.length - 1]));
            }
            const cmdSimple = params.cmd.match(expCmdFilter);
            if (cmdSimple != null) {
                params.cmd = cmdSimple[0];
            }
            // etc..
            params.etc = chain.split(" ").filter(this.filterEmpty);
            // check export
            if (expSet.test(params.cmd)) {
                // wow global setting mod!
                if (params.dest.length === 1 && params.etc.length >= 1) {
                    let endsStr = chain;
                    const endsWithDest = endsStr.match(expTo);
                    if (endsWithDest != null) {
                        endsStr = endsStr.substring(0,endsStr.lastIndexOf(endsWithDest[endsWithDest.length - 1]));
                    }
                    await Promise.all(this.plugins.map((value) => value.changeConfig.bind(value)(params.dest[params.dest.length - 1],endsStr)));
                } else {
                    msg.channel.send(this.cfg.textWrong);
                }
            }
            // dispatch command
            await Promise.all(this.plugins.map((value) => value.onCommand.bind(value)(msg,params)));
        } else {
            
        }
        */
    }
    private filterEmpty(value:string):boolean {
        return value.length >= 1;
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