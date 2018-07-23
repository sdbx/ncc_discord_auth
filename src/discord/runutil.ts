import * as Discord from "discord.js";
import Log from "../log";
import { MainCfg, safeCmd } from "./runtime";

export enum ParamType {
    thing = "이/가",
    dest = "을/를/좀",
    for = "에게/한테",
    to = "으로/로",
    from = "에서",
    do = "해줘/해/줘",
}
export interface Param {
    type:ParamType;
    str:string;
    require:boolean;
}
export class CommandHelp {
    public cmds:string[]; // allow cmds
    public params:Param[]; // parameter info
    public description:string; // Description command
    public complex:boolean; // receive only keyword is matching?
    public reqAdmin:boolean; // require admin?
    public dmOnly:boolean; // direct message only..
    // public singleWord:boolean; // receive only single word?
    public constructor(commands:string, desc:string,complex:boolean = false,
        options?:{reqAdmin?:boolean,dmOnly?:boolean}) {
        this.cmds = commands.split(",");
        this.description = desc;
        this.params = [];
        this.complex = complex;
        if (options != undefined && options != null) {
            this.reqAdmin = options.reqAdmin && true;
            this.dmOnly = options.dmOnly && true;
            // this.singleWord = options.singleWord && true;
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
    public get fields():Param[] {
        return this.params;
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
    public get stdTitle():string {
        let out:string = "";
        out += this.cmds.join("|");
        const designer = (value, index) => {
            const echo:string[] = [];
            echo.push(value.require ? "<" : "[");
            echo.push(value.str);
            echo.push(value.require ? ">" : "]");
            return echo.join("");
        };
        if (this.params.length >= 1) {
            const req = this.params.filter((_v) => _v.require);
            if (req.length >= 1) {
                out += " ";
                out += req.map(designer).join(" ");
            }
            const opt = this.params.filter((_v) => !_v.require);
            if (opt.length >= 1) {
                out += " ";
                out += this.params.filter((_v) => !_v.require).map(designer).join(" ");
            }
        }
        return out;
    }
    public check(global:MainCfg,content:string,state?:CmdParam):CommandStatus {
        const output = {
            match: false,
            reqParam: false,
            requires: new Map<ParamType, string>(),
            opticals: new Map<ParamType, string>(),
            command: ""
        };
        const encoded = this.encode(content);
        let message = encoded.encoded;
        if ((this.reqAdmin && !state.isAdmin) || (this.dmOnly && !state.isDM)) {
            return new CommandStatus(output.match, output.reqParam, output.requires,
                output.opticals, output.command);
        }
        if (global.prefix.test(content)) {
            // standalone mode
            const queryDo = this.endsWith(content, ParamType.do.split("/"));
            if (queryDo != null) {
                message = queryDo.str;
            }
            const queryEnd = this.endsWith(message, this.cmds, true);
            // check command endsWith
            if (queryEnd == null) {
                // @TODO return cmd not match
                return new CommandStatus(output.match, output.reqParam, output.requires,
                     output.opticals, output.command);
            }
            output.match = true;
            message = queryEnd.str.trimRight();
            message = message.replace(global.prefix, "").trimLeft();
            // parse param
            const fields = this.fields;
            const pmSuffix:string[] = [];
            // add suffix search
            fields.map((_v) => _v.type).forEach((_v) => {
                _v.split("/").forEach((_v2) => {
                    if (pmSuffix.indexOf(_v2) < 0) {
                        pmSuffix.push(_v2);
                    }
                });
            });
            // check need param parser
            if (pmSuffix.length >= 1) {
                const wordsRegex = new RegExp(`.+?(${pmSuffix.join("|")})`, "ig");
                if (wordsRegex.test(message)) {
                    // ~~를, ~~에게, ~~를, ...
                    const params = message.match(wordsRegex).map((_v, _i) => {
                        const pm = this.getParamType(_v);
                        return {
                            type: pm.type,
                            data: _v.substring(0, _v.lastIndexOf(pm.suffix)),
                            suffix: pm.suffix,
                            index: _i,
                        }
                    }).filter((_v) => _v.type != null);
                    // split params
                    let buffer = "";
                    for (const param of params) {
                        const duplicates = params.filter((_v) => _v.type === param.type);
                        if (duplicates[duplicates.length - 1].index === param.index) {
                            // flush!
                            const field = fields.filter((_v) => _v.type === param.type);
                            (field[0].require ? output.requires : output.opticals)
                                .set(param.type, this.decode(buffer + param.data, encoded.key));
                            buffer = "";
                        } else {
                            buffer += (param.data + param.suffix);
                        }
                    }
                    message = message.replace(wordsRegex, "");
                }
            }
            // check require paramter exsits
            let exist = true;
            for (const field of fields) {
                if (field.require && !output.requires.has(field.type)) {
                    if (this.complex && message.length >= 1) {
                        output.requires.set(field.type, this.decode(message, encoded.key));
                        message = "";
                        continue;
                    }
                    exist = false;
                    break;
                }
            }
            message = message + queryEnd.end;
            output.command = this.decode(message, encoded.key);
            output.reqParam = !exist;
        } else if (content.startsWith(global.simplePrefix)) {
            // simple mode
            let isVaild = false;
            for (const commandSuffix of this.cmds) {
                const str = global.simplePrefix + commandSuffix;
                if (message.startsWith(str)) {
                    output.command = commandSuffix;
                    message = message.length < str.length ? "" : message.substr(str.length);
                    isVaild = true;
                    break;
                }
            }
            if (!isVaild) {
                // @TODO not vaild action
                return new CommandStatus(output.match, output.reqParam,
                    output.requires, output.opticals, output.command);
            }
            message = message.trim();
            const split = message.split(/\s+/ig);

            output.match = true;
            output.reqParam = false;
            const fields = this.fields;
            const requires = fields.filter((_v) => _v.require);
            const opticals = fields.filter((_v) => !_v.require);
            let i = 0;
            if (requires.length + opticals.length === 1) {
                split[0] = message;
            }
            for (const require of requires) {
                if (split.length <= i) {
                    output.reqParam = true;
                    break;
                }
                output.requires.set(require.type, this.decode(split[i], encoded.key));
                i += 1;
            }
            for (const optical of opticals) {
                if (split.length <= i) {
                    break;
                }
                output.opticals.set(optical.type, this.decode(split[i], encoded.key));
                i += 1;
            }
            let exist = true;
            for (const field of fields) {
                if (field.require && !output.requires.has(field.type)) {
                    exist = false;
                    break;
                }
            }
            output.reqParam = !exist;
        }
        return new CommandStatus(output.match, output.reqParam, output.requires, output.opticals, output.command);
    }
    private encode(source:string) {
        let chain = source;
        const safeList:string[] = [];
        while (safeCmd.test(chain)) {
            const value = source.match(safeCmd)[0];
            safeList.push(value.substring(value.indexOf("\"") + 1, value.lastIndexOf("\"")));
            chain = chain.replace(safeCmd, "${" + (safeList.length - 1) + "}");
        }
        return {
            encoded: chain,
            key: safeList,
        }
    }
    private decode(encoded:string, key:string[]) {
        let chain = encoded;
        key.forEach((value, index) => {
            chain = chain.replace(new RegExp("\\$\\{" + index + "\\}", "i"), value);
        });
        return chain;
    }
    private getParamType(suffix:string) {
        for (const [key, value] of Object.entries(ParamType)) {
            for (const v of value.split("/")) {
                if (suffix.endsWith(v)) {
                    return {
                        type: value as ParamType,
                        suffix: v as string,
                    };
                }
            }
        }
        return null;
    }
    private endsWith(source:string, ends:string[], ws = false) {
        for (const _end of ends) {
            if (source.endsWith((ws ? " " : "") + _end)) {
                return {
                    str: source.substr(0, source.length - _end.length),
                    end: _end,
                };
            }
        }
        return null;
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
    public commandMatch:boolean = false;
    public requireParam:boolean = false;
    public requires:Map<ParamType, string>;
    public opticals:Map<ParamType, string>;
    public command:string;

    constructor(cmdMatch:boolean, reqParam:boolean, require:Map<ParamType, string>
        , opt:Map<ParamType, string>, command:string) {
            this.commandMatch = cmdMatch;
            this.requireParam = reqParam;
            this.requires = require;
            this.opticals = opt;
            this.command = command;
    }
    public has(key:ParamType) {
        return this.exist(key);
    }
    public exist(key:ParamType) {
        return this.requires.has(key) || this.opticals.has(key);
    }
    public get(key:ParamType) {
        if (this.requires.has(key)) {
            return this.requires.get(key);
        } else if (this.opticals.has(key)) {
            return this.opticals.get(key);
        } else {
            return undefined;
        }
    }
    public getSubCmd(start:number, end:number) {
        const commands = this.command.split(/\s+/ig);
        if (end >= commands.length || start > end) {
            return null;
        } else {
            const filter = commands.filter((_v,_i) => _i >= start && _i < end);
            return filter.length >= 1 ? filter.join(" ") : null;
        }
    }
    public getLastCmd(depth:number = 1) {
        const commands = this.command.split(/\s+/ig);
        if (depth >= commands.length) {
            return null;
        }
        return commands[Math.max(0,commands.length - depth)];
    }
    public get match():boolean {
        return this.commandMatch && !this.requireParam;
    }
    public toString():string {
        const require = {};
        const opt = {};
        for (const [key, value] of this.requires) {
            require[key] = value;
        }
        for (const [key, value] of this.opticals) {
            opt[key] = value;
        }
        return JSON.stringify({
            commandMatch: this.commandMatch,
            requireParam: this.requireParam,
            requires: require,
            opticals: opt,
            command: this.command,
        }, null, 4);
    }
}
export interface ChainData {
    type:number;
    data:object;
    time:number;
}
export interface CmdParam {
    isAdmin:boolean,
    isDM:boolean,
    isSimple:boolean,
}