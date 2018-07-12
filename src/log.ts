import * as _caller from "caller";
import chalk, { Chalk } from "chalk";
import * as Hook from "console-hook";
import * as Reverser from "esrever";
import * as Inquirer from "inquirer";
import * as path from "path";
import * as Util from "util";
import * as Log from "./log";

const colorLevel = chalk.supportsColor.level;
const prefixLimit = 16;
const numberLimit = 3;
const totalBlank = 5; // some whitespace
const guidePtrn = 10; // show gray text size
let contentLimit = -1;
let ui:Inquirer.ui.BottomBar;
// 1: 8color 2: 256color 3: 0xFFFFFF color
/*
const chalk = new _chark.constructor({
    level: colorLevel + 1
});
*/
/**
 * Warning
 * @param arg1 Title or Content 
 * @param arg2 Content if exists
 */
export function w(arg1:string,arg2:string = null) {
    custom("#fffacd","#ffaf5f",chalk.bgYellow.yellow,"WRN",{arg1,arg2});
}
/**
 * Infomation
 * @param arg1 Title or Content
 * @param arg2 Content if exists
 */
export function i(arg1:string, arg2:string = null) {
    custom("#aee4f2", "#afd7ff", chalk.bgBlue.blue, "INF", { arg1, arg2 });
}
/**
 * Debug
 * @param arg1 Title or Content
 * @param arg2 Content if exists
 */
export function d(arg1:string, arg2:string = null) {
    custom("#caf9c0", "#afff87", chalk.bgGreen.green, "DBG", { arg1, arg2 });
}
/**
 * Error
 * @param arg1 Title or Content
 * @param arg2 Content if exists
 */
export function e(error:Error | string | object | any) {
    let show:string;
    let title:string = caller();
    if (error instanceof Error) {
        title = error.name;
        show = `${error.message}\nStack: ${error.stack}`;
    } else if (typeof error === "string") {
        show = error;
    } else if (typeof error === "object") {
        show = JSON.stringify(error,null,2);
    } else {
        show = error.toString();
    }
    custom("#ff715b", "#ff5f5f", chalk.bgRed.red, "ERR", {arg1:title, arg2:show});
}
/**
 * Verbose
 * @param arg1 Title or Content
 * @param arg2 Content if exists
 */
export function v(arg1:string, arg2:string = null) {
    custom("#ffc6fd", "#ffd7ff", chalk.bgCyan.cyan, "LOG", { arg1, arg2 });
}
/**
 * JSON trace
 * @param title Title of Content
 * @param obj JSON.stringify object
 */
export function json(title:string, obj:object) {
    custom("#d2b7ff", "#af5fff", chalk.bgCyan.cyan, "OBJ", {arg1:title, arg2:JSON.stringify(obj,null,2)});
}
/**
 * Custom style trace
 * @param themeH A hex of 0xFFFFFF colors
 * @param theme256H A hex of 256 colors
 * @param theme8C Chalk object of 8 colors
 * @param tag Three letter tag
 * @param msg Message (Title, Description)
 */
export function custom(themeH:string, theme256H:string, theme8C:Chalk, tag:string, msg:{arg1:string, arg2?:string}) {
    const design = style(themeH,theme256H,theme8C);
    raw(design.header, design.num, design.content, design.hlight, tag, msg);
}
/**
 * Gen style
 * @param themeH A hex of 0xFFFFFF colors
 * @param theme256H A hex of 256 colors
 * @param theme8C Chalk object of 8 colors
 */
function style(themeH:string, theme256H:string, theme8C:Chalk) {
    let header:Chalk;
    let num:Chalk;
    let content:Chalk;
    let hlight:Chalk;
    switch (colorLevel) {
        case 3: {
            header = chalk.bgHex(themeH).hex("#303030");
            num = chalk.bgHex("#f0f0f0").hex("#424242");
            content = chalk.bgHex("#303030").hex(themeH);
            hlight = header.hex("#888888");
        }
        break;
        case 2: {
            header = chalk.bgHex(theme256H).hex("#303030");
            num = chalk.bgHex("#f0f0f0").hex("#424242");
            content = chalk.bgHex("#303030").hex(theme256H);
            hlight = header.hex("#a0a0a0");
        }
        break;
        default: {
            header = theme8C.black;
            num = chalk.bgWhite.black;
            content = theme8C.bgBlack;
            hlight = theme8C.gray;
        }
    }
    return {
        header,
        num,
        content,
        hlight
    }
}
/**
 * Trace raw
 * @param headerColor Header color
 * @param numberColor Tag color
 * @param contentColor Content color
 * @param headerSemiColor Header(sub) color
 * @param defaultH Tag name
 * @param content Contents (Title, Desc)
 */
export function raw(headerColor:Chalk, numberColor:Chalk, contentColor:Chalk,
    headerSemiColor:Chalk, defaultH:string, content:{arg1:string, arg2?:string}) {
    const prefix = content.arg2 == null ? caller() : content.arg1;
    const message = content.arg2 == null ? content.arg1 : content.arg2;
    // set content width
    contentLimit = Math.max(5, process.stdout.columns - prefixLimit - numberLimit - totalBlank);
    // [20](prefix) [3](num) [1](|) [40+](content)
    const sends = message.split("\n").map((str) => {
        const out:string[] = [];
        while (str.length > 0) {
            const piece = cutstr(str,contentLimit);
            out.push(piece);
            str = str.replace(piece,"");
        }
        return out;
    });
    let useNum = true;
    if (sends.length === 0 || (sends.length === 1 && sends[0].length <= 1)) {
        // only one message
        useNum = false;
    }
    let lines = 0; // all lines
    sends.forEach((value,index) => {
        value.forEach((_v,_i) => {
            lines += 1;
            const useHeader =  lines % guidePtrn === 0 || (index === 0 && _i === 0);
            let numText = "";
            if (!useNum || (index === 0 && _i === 0)) {
                numText = defaultH;
            } else if (_i === 0) {
                numText = (index + 1).toString();
            }
            _log(index === 0 ? headerColor : headerSemiColor, useHeader ? prefix.toString() : "",
                numberColor, numText,
                contentColor,_v);
        });
    });
    // line for readability
    if (lines >= 10) {
        _log(numberColor, "",numberColor, "END",numberColor, "");
    }
}
export function hook() {
    const _hook = Hook(console, true);
    _hook.attach("log", (method, args) => {
        const str = Util.format.apply(this, args);
        Log.d("Legacy",str);
    });
    _hook.attach("error", (method, args) => {
        if (args.length >= 2) {
            Log.e(Util.format.apply(this, args));
        } else if (args.length === 1) {
            Log.e(args[0]);
        }
    });
    // ui = new Inquirer.ui.BottomBar();
}
export function r(title:string, content:string) {
    custom("#b8e3f9", "#afd7ff", chalk.bgBlack.white, "IME", {arg1:title, arg2:content});
}
export async function read(title:string, hide:boolean, need = true, content?:string):Promise<string> {
    if (ui == null) {
        ui = new Inquirer.ui.BottomBar();
    }
    contentLimit = Math.max(5, process.stdout.columns - prefixLimit - numberLimit - totalBlank);
    const design = style("#b8e3f9","#afd7ff",chalk.bgBlack.white);
    content = content == null ? "" : Reverser.reverse(cutstr(Reverser.reverse(content), contentLimit - 1));
    const format = formatLog(
        design.header, title,
        design.num, "IME",
        design.content, content
    ,true, chalk.bgWhite.black.underline);
    if (ui != null) {
        ui.updateBottomBar(format);
    }
    if (need) {
        /*
        Method 1: Design ugly, but stable!
        const mutable = new Mutable(); 
        mutable.muted = false;
        const mutableStream = new Writable(mutable);
        const rl = readline.createInterface({
            input: process.stdin,
            output: mutableStream,
            terminal: true
        });
        rl.on("line",(input) => console.log(input));
       */
        // Method 2: Design directly
        const stdin = process.stdin;
        // stdin.setRawMode(true);
        stdin.resume();
        // stdin.setEncoding("utf-8");
        return new Promise<string>((res,rej) => {
            const ime = new IME(title,hide,res,rej);
            process.stdin.on("data", ime.onData.bind(ime));
        });
    } else {
        return Promise.resolve("ok");
    }
}
export function removeReset(ansi:string) {
    return ansi.replace(/(.\[39m.\[49m|.\[0m])$/i, "");
}
function formatLog(headerColor:Chalk, headerMsg:string,
     numberColor:Chalk,numberMsg:string, contentColor:Chalk, contentMsg:string,
      paddingEnd:boolean = true, cursor:Chalk = null) {
    headerMsg = cutstr(headerMsg,prefixLimit);
    numberMsg = cutstr(numberMsg,numberLimit);
    contentMsg = cutstr(contentMsg,contentLimit);
    // totalBlank = 5;
    const format = [];
    if (headerMsg != null) {
        format.push(headerColor(`${headerMsg.padStart(prefixLimit - unicodeLength(headerMsg))} `));
    }
    if (numberMsg != null) {
        format.push(numberColor(` ${numberMsg.padStart(numberLimit - unicodeLength(numberMsg))} `));
    }
    if (contentMsg != null) {
        let _cM = ` ${contentMsg.padEnd(contentLimit - unicodeLength(contentMsg))} `;
        if (!paddingEnd && length(_cM) < process.stdout.columns) {
            _cM = _cM.trimRight();
        }
        if (cursor != null) {
            const bl = _cM.match(/\s+/ig);
            if (bl.length >= 1) {
                const sizeSub = _cM.length - contentMsg.length - 1;
                format.push([contentColor(_cM.substr(0, contentMsg.length + 1)),
                    cursor(" "),contentColor("".padEnd(sizeSub - 1))].join(""));
            } else {
                format.push(contentColor(_cM));
            }
        } else {
            format.push(contentColor(_cM));
        }
    }
    return format.join("");
}
function _log(headerColor:Chalk, headerMsg:string,
    numberColor:Chalk, numberMsg:string, contentColor:Chalk, contentMsg:string) {
    const format = formatLog(headerColor,headerMsg,numberColor,numberMsg,contentColor,contentMsg);
    if (ui != null) {
        ui.log.write(format + "\n");
    } else {
        process.stdout.write(format + "\n");
    }
}
function caller() {
    let dp = 1;
    let deeper;
    do {
        deeper = _caller(dp);
        dp += 1;
    } while ((deeper as string).endsWith("/log.js"));
    let out:string = path.resolve(deeper).replace(path.resolve(__dirname) + "/","");
    if (out.length >= prefixLimit) {
        out = `~${out.substr(out.lastIndexOf("/") + 1)}`;
    }
    return out;
}
function length(str:string) {
    if (str == null) {
        return 0;
    }
    if (str.match(/[ -~]/ig) == null) {
        return str.length * 2;
    }
    const asciis = str.match(/[ -~]/ig).length;
    const unicodes =  unicodeLength(str);
    return asciis + 2 * unicodes;
}
function unicodeLength(str:string) {
    return str.replace(/[ -~]/ig, "").length;
}
function cutstr(str:string, end:number) {
    let ln = 0;
    let k = 0;
    if (str == null) {
        return null;
    }
    for (const char of str.split("")) {
        const cn = char.charCodeAt(0);
        ln += (cn >= 32 && cn <= 126) ? 1 : 2;
        k += 1;
        if (ln >= end) {
            return str.substring(0, k);
        }
    }
    return str;
}
class IME {
    public mute:boolean = false;
    private readonly timeout = 30;
    private resolve;
    private reject;
    private time = this.timeout;
    private timer;
    private title;
    private hide;
    private data:string[] = [];
    constructor(title:string, hide:boolean, res:(value:string | PromiseLike<string>) => void,rej:(reason:any) => void) {
        this.resolve = res;
        this.reject = rej;
        this.title = title;
        this.hide = hide;
        this.timer = setInterval(this.cancel,1000);
    }
    public cancel() {
        if (this.time <= 0) {
            this.finish(false,"Timeout");
        } else {
            this.time -= 1;
        }
    }
    public onData(key:Uint8Array) {
        clearTimeout(this.timer);
        let keycode = 0;
        const ln = key.length - 1;
        const str = key.toString();
        key.forEach((_v, _i) => {
            keycode += (_v << 16 * (ln - _i));
        });
        if (keycode >= 0xFFFFFF) {
            str.split("").forEach((_v) => {
                this.data.push(_v);
            });
            keycode = -1;
        } else {
            keycode &= 0xFFFFFF;
        }
        switch (keycode) {
            case 0x1B: {
                // Esc
                this.finish(false, "Cancel.");
                return;
            } break;
            case 0x7F: {
                // Backspace
                if (this.data.length >= 1) {
                    this.data.pop();
                }
            } break;
            case 0x4E00D9: {
                // Del
                if (this.data.length >= 1) {
                    this.data = [];
                }
            } break;
            case 0xD: {
                // Return or enter
                this.finish(true, this.data.join(""));
                return;
            } break;
            default: {
                if (keycode !== -1) {
                    this.data.push(str);
                }
            }
        }
        this.time = this.timeout;
        this.timer = setTimeout(this.cancel, 1000);
        read(this.title, this.hide, false, (this.hide ? this.data.map(() => "*") : this.data).join(""));
    }
    public finish(success:boolean, data:string) {
        r(this.title, (this.hide ? this.data.map(() => "*") : this.data).join(""));
        ui.updateBottomBar("");
        process.stdin.removeAllListeners("data");
        process.stdin.pause();
        if (ui != null) {
            ui.close();
            ui = null;
            // ui.updateBottomBar("");
        }
        if (success) {
            this.resolve(data);
        } else {
            this.reject(data);
        }
    }
}