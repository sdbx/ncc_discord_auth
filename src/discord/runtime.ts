import * as Discord from "discord.js";
import Config from "../config";
import Plugin from "./plugin";

import * as Log from "../log";
import Ncc from "../ncc/ncc";
import Lang from "./lang";
import Auth from "./module/auth";
import Login from "./module/login";
import Ping from "./module/ping";

const expDest = /.+?(을|를|좀)\s+/i;
const expCmd = /[\w가-힣]+(줘|해)/ig;
const expCmdSuffix = /(해|줘|해줘)/ig;

const queryCmd = /\s+\S+/ig;
const safeCmd = /(".+?")|('.+?')/i;
export enum ParamType {
    dest = "을/를",
    for = "에게/한테",
    to = "으로/로",
    from = "에서",
    do = "해줘/해/줘",
}
export interface Keyword {
    type:ParamType;
    str:string;
    query?:string[];
    require?:boolean;
}
export class CommandHelp {
    public cmds:string[]; // allow cmds
    public params:Keyword[]; // parameter info
    public description:string; // Description command
    public complex:boolean = false; // receive only keyword is matching?
    public constructor(commands:string, desc:string) {
        this.cmds = commands.split(",");
        this.description = desc;
        this.params = [];
    }
    public addField(type:ParamType, content:string,require:boolean = true) {
        this.params.push({
            type,
            str: content,
            require,
        });
    }
    public get title():string {
        let out:string = "";
        if (this.params.length >= 1) {
            out = this.params.map((value,index) => {
                const echo:string[] = [];
                echo.push(value.require ? "<" : "[");
                echo.push(value.str);
                echo.push(` (${value.type.replace(/\//ig,",")})`);
                echo.push(value.require ? ">" : "]");
                return echo.join("");
            }).join(" ");
            out += " ";
        }
        out += this.cmds.join("|");
        return out;
    }
}
export default class Runtime {
    private cfg = new Bot();
    private lang = new Lang();
    private client:Discord.Client;
    private ncc:Ncc;
    private plugins:Plugin[] = [];
    private strictCommands:Map<string,ParamType[]> = new Map();
    constructor() {
        this.plugins.push(new Ping(),new Auth(), new Login());
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
    protected async ready() {
        // init plugins
        for (const plugin of this.plugins) {
            plugin.init(this.client, this.ncc, this.lang);
            await plugin.ready();
        }
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
            pieces = pieces.reverse().filter((v) => v.type !== ParamType.do);
        } else {
            // no exists :(
            cmd = cacheWord.join("").trim();
        }
        await Promise.all(this.plugins.map((value) => value.onCommand.bind(value)(msg, cmd, pieces)));
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