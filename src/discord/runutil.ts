import * as Discord from "discord.js";
import Log from "../log";

export enum ParamType {
    thing = "이/가",
    dest = "을/를/좀",
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
    public complex:boolean; // receive only keyword is matching?
    public reqAdmin:boolean; // require admin?
    public dmOnly:boolean; // direct message only..
    public constructor(commands:string, desc:string,complex:boolean = false,
        options?:{reqAdmin?:boolean,dmOnly?:boolean}) {
        this.cmds = commands.split(",");
        this.description = desc;
        this.params = [];
        this.complex = complex;
        if (options != undefined && options != null) {
            this.reqAdmin = options.reqAdmin && true;
            this.dmOnly = options.dmOnly && true;
            if (this.reqAdmin) {
                this.description += " (관리자)";
            }
            if (this.dmOnly) {
                this.description += " (1:1챗)";
            }
        } else {
            this.reqAdmin = this.dmOnly = false;
        }
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
    public check(type:string,admin:boolean) {
        return {
            admin,
            dm: type === "dm",
        };
    }
    public test(command:string, options:Keyword[], checks?:{admin:boolean,dm:boolean}) {
        let cmdOk = false;
        let cmdPiece;
        let optStatus:string = null;
        if (checks == null && (this.reqAdmin || this.dmOnly)) {
            // :(
        } else if (this.reqAdmin && !checks.admin) {
            // :(
        } else if (this.dmOnly && !checks.dm) {
            // :(
        } else {
            for (const cmd of this.cmds) {
                if (cmd === command) {
                    cmdOk = true;
                    break;
                }
                if (this.complex && command.endsWith(" " + cmd)) {
                    cmdOk = true;
                    cmdPiece = command.substring(0, command.lastIndexOf(" " + cmd));
                    break;
                }
            }
        }
        const must = this.params.filter((_v) => _v.require);
        const optional = this.params.filter((_v) => !_v.require);

        const param_must:Map<ParamType, string> = new Map();
        const param_opt:Map<ParamType, string> = new Map();

        if (cmdOk) {
            let dummy = false;
            for (const paramP of options) {
                // check - must
                let _must = -1;
                must.forEach((_v,_i) => {
                    if (_must < 0 && paramP.type === _v.type) {
                        _must = _i;
                        param_must.set(paramP.type,paramP.str);
                    }
                });
                if (_must >= 0) {
                    must.splice(_must,1);
                    continue;
                }
                // check - opt
                let _opt = -1;
                optional.forEach((_v,_i) => {
                    if (_opt < 0 && paramP.type === _v.type) {
                        _opt = _i;
                        param_opt.set(paramP.type,paramP.str);
                    }
                });
                if (_opt >= 0) {
                    optional.splice(_opt,1);
                    continue;
                }
                // cmd.. or dummy?
                if (paramP.type !== ParamType.do) {
                    dummy = true;
                    if (this.complex) {
                        param_opt.set(paramP.type,paramP.str);
                    }
                }
            }
            if (must.length >= 1) {
                if (this.complex && must.length === 1 && cmdPiece != null) {
                    param_must.set(must[0].type, cmdPiece);
                    must.splice(0,1);
                    cmdPiece = null;
                } else {
                    optStatus = must.map((_v) => _v.str).join(", ");
                }
            }
            if (this.complex && optional.length === 1 && cmdPiece != null) {
                param_opt.set(optional[0].type, cmdPiece);
                optional.slice(0,1);
            }
            if (!this.complex && (optional.length >= 1 || dummy)) {
                Log.i(command,"Strict mode: failed. But pass.");
            }
        }
        return new CommandStatus(
            cmdOk,
            optStatus,
            param_must,
            param_opt,
            command.split(/\s/ig),
        );
    }
}
export class DiscordFormat {
    public static mentionUser(userid:string) {
        return `<@${userid}>`;
    }
    public static mentionChannel(channelid:string) {
        return `<#${channelid}>`;
    }
    public static emoji(emojiName:string, emojiId:string, animated = false) {
        return `<${animated ? "a" : ""}:${emojiName}:${emojiId}>`;
    }

    private _italic = false;
    private _bold = false;
    private _underline = false;
    private _namu = false;
    private _block = false;
    private _blockBig = false;
    private readonly _content:string;
    public constructor(str:string) {
        this._content = str;
    }
    public get normal() {
        this._italic = this._bold = this._underline = this._namu = false;
        return this;
    }
    public get italic() {
        this._italic = true;
        return this;
    }
    public get bold() {
        this._bold = true;
        return this;
    }
    public get underline() {
        this._underline = true;
        return this;
    }
    public get namu() {
        this._namu = true;
        return this;
    }
    public get block() {
        this._block = true;
        return this;
    }
    public get blockBig() {
        this._blockBig = true;
        return this;
    }
    public toString() {
        let format = "%s";
        if (this._underline) {
            format = format.replace("%s","__%s__");
        }
        if (this._namu) {
            format = format.replace("%s","~~%s~~");
        }
        if (this._italic) {
            format = format.replace("%s","*%s*");
        }
        if (this._bold) {
            format = format.replace("%s","**%s**");
        }
        if (this._block || this._blockBig) {
            format = "%s";
            if (this._block) {
                format = format.replace("%s", "`%s`");
            } else {
                format = format.replace("%s","```%s```");
            }
        }
        return format.replace("%s",this._content);
    }
}
export class CommandStatus {
    public requires:Map<ParamType, string>;
    public options:Map<ParamType, string>;
    public commands:string[];
    protected commandMatch:boolean;
    protected optionStatus:string;
    constructor(cmdOk:boolean, optStatus:string, req:Map<ParamType, string>, 
            choices:Map<ParamType, string>, cmds:string[]) {
        this.commandMatch = cmdOk;
        this.requires = req;
        this.options = choices;
        this.optionStatus = optStatus;
        this.commands = cmds;
    }
    public get match() {
        return this.commandMatch && this.optionStatus == null;
    }
    public error(msg:string) {
        if (this.commandMatch && this.optionStatus != null) {
            return sprintf(msg,{param:this.optionStatus});
        }
        return null;
    }
    public has(key:ParamType) {
        return this.exist(key);
    }
    public exist(key:ParamType) {
        return this.requires.has(key) || this.options.has(key);
    }
    public get(key:ParamType) {
        if (this.requires.has(key)) {
            return this.requires.get(key);
        } else if (this.options.has(key)) {
            return this.options.get(key);
        } else {
            return undefined;
        }
    }
    public getSubCmd(start:number, end:number) {
        if (end >= this.commands.length || start > end) {
            return null;
        } else {
            const filter = this.commands.filter((_v,_i) => _i >= start && _i < end);
            return filter.length >= 1 ? filter.join(" ") : null;
        }
    }
    public getLastCmd(depth:number = 1) {
        if (depth >= 1 && this.commands.length <= 1) {
            return null;
        }
        return this.commands[Math.max(0,this.commands.length - depth)];
    }
}
export interface ChainData {
    type:number;
    data:object;
    time:number;
}