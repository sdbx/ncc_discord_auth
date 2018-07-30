import * as Discord from "discord.js";
import Log from "../log";
import { MainCfg } from "./runtime";

const safeCmd = /(".+?")|('.+?')/i;
export enum ParamType {
    thing = "이/가",
    dest = "을/를/좀",
    for = "에게/한테",
    to = "으로/로",
    from = "에서",
    do = "해줘/해/줘",
}
export enum ParamAccept {
    ANY,
    NUMBER,
    USER,
    CHANNEL,
}
// tslint:disable-next-line
class AcceptRegex {
    public static check(type:ParamAccept, str:string):string | null {
        let tag;
        switch (type) {
            case ParamAccept.NUMBER : tag = "NUMBER"; break;
            case ParamAccept.USER : tag = "USER"; break;
            case ParamAccept.CHANNEL : tag = "CHANNEL"; break;
            default: tag = "ANY";
        }
        if (AcceptRegex[tag].test(str)) {
            if (tag !== "ANY") {
                return str.match(/[0-9]+/i)[0];
            } else {
                return str;
            }
        }
        return null;
    }
    private static readonly ANY = /.*/ig;
    private static readonly NUMBER = /[0-9]+/i;
    private static readonly USER = /<@[0-9]+>/i;
    private static readonly CHANNEL = /<#[0-9]+>/i;
}
export interface Param {
    type:ParamType; // type via natural (~~to)
    code?:string[]; // type via simple (!auth code:Pickaxe) - maybe null
    accept?:ParamAccept; // accept types
    desc:string; // Description of command
    require:boolean; // require?
}
export class CommandHelp {
    public cmds:string[]; // allow cmds
    public params:Param[]; // parameter info
    public complex:boolean; // receive only keyword is matching?
    public reqAdmin:boolean; // require admin?
    public dmOnly:boolean; // direct message only..
    private _description:string; // Description command
    private example:Map<string, string>; // example parameter.. todo.
    // public singleWord:boolean; // receive only single word?
    public constructor(commands:string, desc:string,complex:boolean = false,
        options?:{ reqAdmin?:boolean, dmOnly?:boolean, example?:Map<string, string>}) {
        this.cmds = commands.split(",");
        this._description = desc;
        this.example = this.safeGet(this.example, new Map());
        this.params = [];
        this.complex = complex;
        if (options != undefined && options != null) {
            this.reqAdmin = this.safeGet(options.reqAdmin, false);
            this.dmOnly = this.safeGet(options.dmOnly, false);
            // this.singleWord = options.singleWord && true;
            if (this.reqAdmin) {
                this._description += " (관리자)";
            }
            if (this.dmOnly) {
                this._description += " (1:1챗)";
            }
        } else {
            this.reqAdmin = this.dmOnly = false;
        }
    }
    public get description() {
        return this._description;
    }
    public addField(type:ParamType, content:string,
        require:boolean, options:{code?:string[], accept?:ParamAccept} = {}) {
        this.params.push({
            type,
            code: this.safeGet(options.code, []),
            accept: this.safeGet(options.accept, ParamAccept.ANY),
            desc: content,
            require,
        } as Param);
    }
    public get fields():Param[] {
        return this.params;
    }
    public get title():string {
        return this.getTitle(false);
    }
    public get simpleTitle():string {
        return this.getTitle(true);
    }
    public check(global:MainCfg,content:string,state?:CmdParam):CommandStatus {
        const output = {
            match: false,
            reqParam: false,
            requires: new Map<ParamType, FieldBlock>(),
            opticals: new Map<ParamType, FieldBlock>(),
            command: "",
        };
        const encoded = this.encode(content);
        let message = encoded.encoded;
        if ((this.reqAdmin && !state.isAdmin) || (this.dmOnly && !state.isDM)) {
            return new CommandStatus(output.match, output.reqParam, output.requires,
                output.opticals, output.command);
        }
        Log.d("Command", this.cmds.join(","));
        if (global.prefix.test(content)) {
            const blocks = this.splitByFields(content, global.prefix, this.fields);
            if (blocks == null) {
                // @TODO return cmd not match
                return new CommandStatus(output.match, output.reqParam, output.requires,
                     output.opticals, output.command);
            }
            for (const block of blocks) {
                const field = getFirst(this.fields.filter((v) => v.type));
                block.content = this.decode(block.content, encoded.key);
                if (field == null) {
                    continue; // wtf???
                }
                // check subType requires
                if (field.code.length >= 2 && block.subType == null) {
                    // Require Field
                    Log.d("Require Field!");
                    continue;
                }
                // check type is correct
                if (AcceptRegex.check(field.accept, block.content) == null) {
                    Log.w("Parameter Type is wrong!");
                    continue;
                }
                block.content = AcceptRegex.check(field.accept, block.content);
                (field.require ? output.requires : output.opticals).set(field.type, block);
            }
            const cmd = this.getCommand(this.decode(message, encoded.key));
            if (cmd != null) {
                output.command = cmd.long;
                output.match = true;
            }
            output.reqParam = output.requires.size < this.fields.filter((v) => v.require).length;
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
            const parse = (field:Param, str:string) => {
                let con = this.decode(str, encoded.key);
                let rCode = null;
                for (const _code of field.code) {
                    for (const __code of _code.split("/")) {
                        if (con.startsWith(__code + ":")) {
                            con = con.substr(con.indexOf(":") + 1);
                            rCode = _code;
                        }
                    }
                }
                return {
                    content: con,
                    type: field.type,
                    subType: rCode,
                    ends: "",
                } as FieldBlock;
            }
            for (const require of requires) {
                if (split.length <= i) {
                    output.reqParam = true;
                    break;
                }
                const block = parse(require, split[i]);
                if (require.code.length <= 1 || block.subType != null) {
                    output.requires.set(require.type, block);   
                }
                i += 1;
            }
            for (const optical of opticals) {
                if (split.length <= i) {
                    break;
                }
                const block = parse(optical, split[i]);
                if (optical.code.length <= 1 || block.subType != null) {
                    output.opticals.set(optical.type, block);   
                }
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
    protected getCommand(str:string) {
        const suffix = getFirst(
            str.match(new RegExp(`(${this.cmds.join("|")})(${ParamType.do.replace(/\//ig,"|")})$`,"ig"))
        );
        if (suffix == null) {
            return null;
        }
        const short = suffix.replace(new RegExp(`(${ParamType.do.replace(/\//ig,"|")})$`,"ig"), "").trim();
        return {
            short,
            long: getFirst(this.cmds.filter((v) => short === v)),
        };
    }
    protected splitByFields(str:string, prefix:RegExp, fields:Param[]) {
        // cut header
        let chain = str;
        if (chain.match(prefix) == null) {
            return null;
        }
        chain = chain.replace(prefix,"").trimLeft();
        // cut suffix
        const suffix = getFirst(
            chain.match(new RegExp(`(${this.cmds.join("|")})(${ParamType.do.replace(/\//ig,"|")})$`,"ig"))
        );
        if (suffix == null) {
            return null;
        }
        chain = chain.replace(suffix, "");
        // query field block
        const queryBlocks:FieldBlock[] = [];
        for (const field of fields) {
            // generate field block
            const destCommands = field.type.split("/");
            const mergeCommands = [];
            if (field.code.length >= 1) {
                mergeCommands.push(...field.code);
            }
            if (field.code.length < 2) {
                mergeCommands.push(...destCommands);
            }
            // regex match for block
            const fsmatch = new RegExp(`.*(${mergeCommands.join("|")})(${destCommands.join("|")})?\\s+`,"ig");
            let regexMatch = getFirst(chain.match(fsmatch)); // regexMatch must have "TRIM" on right
            if (regexMatch != null) {
                // check cmd
                regexMatch = regexMatch.trimRight();
                const filter = this.endsWith(regexMatch, destCommands, false);
                let codeID;
                let ends = "";
                if (filter != null) {
                    const codeObj = getFirst(field.code
                        .map((v, i) => ({obj:this.endsWith(regexMatch, v.split("/")), index:i}))
                        .filter((v) => v.obj != null));
                    if (codeObj != null) {
                        codeID = field.code[codeObj.index];
                        ends += codeObj.obj.end;
                    }
                    ends += filter.end;
                }
                queryBlocks.push({
                    content: substrMatch(chain, 0, mergeCommands).trimRight(),
                    subType: codeID,
                    type: field.type,
                    ends,
                } as FieldBlock);
            } else if (fields.length === 1 && this.complex && field.code.length <= 1) {
                // Special case: if only one parameter
                queryBlocks.push({
                    content: chain.trim(),
                    type: field.type,
                    ends: "",
                } as FieldBlock);
                break;
            }
        }
        chain = chain.trimRight();
        // resort ordering
        const orderedBlocks:FieldBlock[] = [];
        queryBlocks.sort((a, b) => {
            const aS = a.content + a.ends
            const aEnd = chain.indexOf(aS) + aS.length // not include
            const bS = b.content + b.ends;
            const bEnd = chain.indexOf(bS) + bS.length;
            return aEnd - bEnd;
        })
        // make block useful.
        for (let i = 0; i < queryBlocks.length; i += 1) {
            const lastEnd = i === 0 ? 0 : queryBlocks[i - 1].content.length + queryBlocks[i - 1].ends.length;
            orderedBlocks.push({
                ...queryBlocks[i],
                content: chain.substr(lastEnd, queryBlocks[i].content.length - lastEnd).trim(),
            });
        }
        /**
         * Return Blocks
         */
        return orderedBlocks;
    }
    protected getTitle(simple:boolean) {
        let out:string = "";
        if (simple) {
            out += `${this.cmds.join("|")} `
        }
        if (this.params.length >= 1) {
            out += this.params.map((value) => {
                return this.getFieldHelp(value, !simple);
            }).join(" ");
        }
        if (!simple) {
            out += ` ${this.cmds.join("|")}`;
        }
        return out;
    }
    protected getFieldHelp(value:Param, korMode:boolean) {
        const guideCode = value.code.length >= 2;
        const cmds = value.code.map(
            (_v) => this.getPreferText(_v.split(",").map((__v) => __v.trim()), true))
        const splitter = this.safeGet(value.desc, "").length <= 0 ? "" : ":";
        let echo = "";
        echo += value.require ? "<" : "[";
        if (!korMode) {
            if (guideCode) {
                echo += `{${cmds.join("|")}}${splitter}`;
            } else if (cmds.length === 1) {
                echo += `${cmds[0]}${splitter}`; 
            }
        }
        if (value.desc.length >= 1) {
            echo += guideCode ? `[${value.desc}]` : value.desc;
        }
        if (korMode) {
            if (guideCode && value.code) {
                echo += ` {${cmds.join("|")}}`;
            }
        }
        echo += value.require ? ">" : "]";
        if (korMode) {
            echo += `{${value.type.replace(/\//ig,",")}}`;
        }
        return echo;
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
    private safeGet<T>(obj:T | undefined, defaultV:T | null):T | null {
        return obj == null ? defaultV : obj;
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
    private getPreferText(arr:string[], ascii = true) {
        if (arr.length === 1) {
            return arr[0]
        } else if (arr.length >= 2) {
            const alphabetCmd = /[A-Za-z0-9_]/ig;
            const delta = (str:string) => {
                if (str.length <= 0 || str == null) {
                    return -1;
                }
                return Math.round((this.safeGet(str.match(alphabetCmd), []).length / str.length) * 1000);
            }
            arr.sort((a,b) => {
                return delta(a) - delta(b);
            });
            return arr[ascii ? 0 : arr.length - 1];
        } else {
            // wtf
            return null;
        }
    }
    private endsWith(source:string, ends:string[], ws = false) {
        if (source == null) {
            return null;
        }
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
    public static formatUser(user:Discord.User) {
        return {
            name:user.username,
            mention:`<@${user.id}>`
        }
    }
    public static mentionUser(userid:string) {
        return `<@${userid}>`;
    }
    public static mentionChannel(channelid:string) {
        return `<#${channelid}>`;
    }
    public static emoji(emojiName:string, emojiId:string, animated = false) {
        return `<${animated ? "a" : ""}:${emojiName}:${emojiId}>`;
    }
    public static getNickname(msg:Discord.Message) {
        if (msg.channel.type !== "dm" && msg.guild.member(msg.author) != null) {
            const guildnick = msg.guild.member(msg.author).nickname;
            return guildnick != null ? guildnick : msg.author.username;
        } else {
            return msg.author.username;
        }
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
    public requires:Map<ParamType, FieldBlock>;
    public opticals:Map<ParamType, FieldBlock>;
    public command:string;

    constructor(cmdMatch:boolean, reqParam:boolean, require:Map<ParamType, FieldBlock>
        , opt:Map<ParamType, FieldBlock>, command:string) {
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
interface FieldBlock {
    content:string;
    subType?:string;
    type?:ParamType;
    ends:string;
}

export function getFirst<T>(arr:T[]):T {
    if (arr != null && arr.length >= 1) {
        return arr[0];
    } else {
        return null;
    }
}
export function getFirstMap<T, V>(m:Map<T, V>):V {
    if (m != null && m.size >= 1) {
        for (const [k, v] of m) {
            return v;
        }
    }
    return null;
}
export function substrMatch(str:string, start:number | string[], end:number | string[],
    startOffset = 0, endOffset = 0) {
    if (Array.isArray(start)) {
        let n = -1;
        for (const value of start) {
            n = str.indexOf(value);
            if (n >= 0) {
                break;
            }
            n = -1;
        }
        if (n >= 0) {
            start = n;
        } else {
            start = 0;
        }
    }
    start = Math.max(0,start + startOffset);
    if (Array.isArray(end)) {
        let n = -1;
        for (const value of end) {
            n = str.lastIndexOf(value);
            if (n >= 0) {
                break;
            }
            n = -1;
        }
        if (n >= 0) {
            end = n;
        } else {
            end = str.length - 1;
        }
    }
    end = Math.min(str.length, end + endOffset);
    return str.substring(start, end);
}