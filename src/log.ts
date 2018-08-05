import * as _caller from "caller"
import _chalk, { Chalk } from "chalk"
import * as Hook from "console-hook"
import * as Reverser from "esrever"
import * as fs from "fs-extra"
import * as Inquirer from "inquirer"
import * as path from "path"
import * as request from "request-promise-native"
import * as terminalImage from "terminal-image"
import * as terminalLink from "terminal-link"
import * as Util from "util"

/* tslint:disable:no-namespace */
/**
 * Log module like Android Logcat
 */
namespace Log {
    const colorLevel = _chalk.supportsColor.level
    /**
     * The maximum size of prefix
     */
    const prefixLimit = 16
    /**
     * The maximum size of Number field
     */
    const numberLimit = 3
    /**
     * Total of whitespace, check code for detail..
     */
    const totalBlank = 5 // some whitespace
    /**
     * Repeat prefix each {guidePtrn} time
     */
    const guidePtrn = 10 // show gray text size
    let contentLimit = -1
    let lastTiming = Date.now()
    export let ui:Inquirer.ui.BottomBar
    // 1: 8color 2: 256color 3: 0xFFFFFF color
    const chalk = new _chalk.constructor({
        level: colorLevel === 1 ? 0 : colorLevel
    })
    /**
     * Warning
     * @param title Title or Content 
     * @param content Content if exists
     */
    export function w(title:string,content:string = null) {
        custom("#fffacd","#ffaf5f",chalk.bgYellow.yellow,"WRN",{title,content})
    }
    /**
     * Infomation
     * @param title Title or Content
     * @param content Content if exists
     */
    export function i(title:string, content:string = null) {
        custom("#aee4f2", "#afd7ff", chalk.bgBlue.blue, "INF", { title, content })
    }
    /**
     * Debug
     * @param title Title or Content
     * @param content Content if exists
     */
    export function d(title:string, content:string = null) {
        custom("#caf9c0", "#afff87", chalk.bgGreen.green, "DBG", { title, content })
    }
    /**
     * Error
     * @param error Error object or string or any..
     */
    export function e(error:Error | string | object | any) {
        let show:string
        let title:string = caller()
        if (error instanceof Error) {
            title = error.name
            show = `${error.message}\nStack: ${error.stack}`
        } else if (typeof error === "string") {
            if (error.indexOf(":") >= 0) {
                title = error.substring(0,error.indexOf(":")).trimRight()
                show = error.substr(Math.min(error.length - 1,error.indexOf(":") + 1)).trimLeft()
            } else {
                show = error
            }
        } else if (typeof error === "object") {
            show = JSON.stringify(error,null,2)
        } else {
            if (error != null) {
                // wtf
                show = error.toString()
            } else {
                show = ""
            }
        }
        custom("#ff715b", "#ff5f5f", chalk.bgRed.red, "ERR", {title, content:show})
    }
    /**
     * Verbose
     * @param title Title or Content
     * @param content Content if exists
     */
    export function v(title:string, content:string = null) {
        custom("#ffc6fd", "#ffd7ff", chalk.bgCyan.cyan, "LOG", { title, content })
    }
    /**
     * Record or log time (benchmarking)
     * @param name Title of log
     */
    export function time(name?:string) {
        if (name == null) {
            lastTiming = Date.now()
            return 0
        }
        const delta = Date.now() - lastTiming
        d(name, "Time-Delta: " + delta)
        lastTiming = Date.now()
        return delta
    }
    /**
     * JSON trace
     * @param title Title of Content
     * @param obj JSON.stringify object
     */
    export function json(title:string, obj:object) {
        custom("#d2b7ff", "#af5fff", chalk.bgCyan.cyan, "OBJ", {title, content:JSON.stringify(obj,null,2)})
    }
    export function url(title:string, _url:string, desc?:string) {
        const design = style("#eff9b8","#eff9b8",chalk.bgBlack.white)
        if (desc == null) {
            desc = decodeURIComponent(_url).replace(/\?.*/ig, "")
            desc = desc.substring(desc.lastIndexOf("/") + 1)
        }
        raw(design.header, design.num, design.content, design.hlight, "URL", {title, content: desc})
        // parse raw
        const column = process.stdout.columns
        const split:string[] = []
        let chain = _url
        while (chain.length > 0) {
            const str = cutstr(chain, Math.min(length(chain), column - 7))
            split.push(str)
            chain = chain.replace(str, "")
        }
        let out = ""
        split.forEach((_v, _i) => {
            const content = _v.padEnd(column - 7 - unicodeLength(_v))
            out += design.header(` ${_i === 0 ? "   " : "   "} `)
            out += design.content(` ${terminalLink(content, _url)}${
                length(content) >= column - numberLimit - 3 ? "" : " "
            }`)
            out += "\n"
        })
        stdWrite(out)
    }
    /**
     * Image trace...????
     */
    export async function image(_image:string | Buffer, title:string, desc?:string) {
        let binary:Buffer
        if (typeof _image === "string") {
            if (/^http(s)?:\/\//.test(_image)) {
                if (desc == null) {
                    desc = path.basename(decodeURIComponent(_image.replace(/\?.*/ig, "")))
                }
                binary = await request.get(_image, { encoding: null })
            } else {
                _image = _image.replace(/\\\s/ig, " ")
                const p = path.resolve(_image)
                if (await fs.pathExists(p)) {
                    binary = (await fs.readFile(p, {encoding: null})) as any
                }
            }
        } else {
            binary = _image
        }
        // flush cache need.
        await new Promise((res, rej) => {
            terminalImage.buffer(binary).then((str) => {
                if (typeof _image === "string") {
                    Log.url(title, _image, desc)
                } else {
                    Log.i(title, desc == null ? "Image" : desc)
                }
                stdWrite(str, () => {
                    res()
                })
            }).catch(() => {
                rej()
            })
        })
        const white = chalk.bgHex("#eff9b8").hex("#424242")
        await new Promise((res, rej) => {
            stdWrite(white("".padEnd(process.stdout.columns)) + "\n", () => res())
        })
        // raw(white, white, white, white, "", {title:"", content: "Image end."})
        return Promise.resolve()
    }
    /**
     * Custom style trace
     * @param themeH A hex of 0xFFFFFF colors
     * @param theme256H A hex of 256 colors
     * @param theme8C Chalk object of 8 colors
     * @param tag Three letter tag
     * @param msg Message (Title, Description)
     */
    export function custom(themeH:string, theme256H:string, theme8C:Chalk, 
        tag:string, msg:{title:string, content?:string}) {
        const design = style(themeH,theme256H,theme8C)
        raw(design.header, design.num, design.content, design.hlight, tag, msg)
    }
    /**
     * Gen style
     * @param themeH A hex of 0xFFFFFF colors
     * @param theme256H A hex of 256 colors
     * @param theme8C Chalk object of 8 colors
     * @param inverse Reverse Primary and Secondary color?
     */
    function style(themeH:string, theme256H:string, theme8C:Chalk, inverse = false) {
        let header:Chalk
        let num:Chalk
        let content:Chalk
        let hlight:Chalk
        const black = "#303030"
        const numBlack = "#424242"
        const numWhite = "#f0f0f0"
        switch (colorLevel) {
            case 3: {
                header = !inverse ? chalk.bgHex(themeH).hex(black) : chalk.bgHex(black).hex(themeH)
                num = inverse ? chalk.bgHex(numBlack).hex(numWhite) : chalk.bgHex(numWhite).hex(numBlack)
                content = inverse ? chalk.bgHex(themeH).hex(black) : chalk.bgHex(black).hex(themeH)
                hlight = header.hex("#888888")
            }
            break
            case 2: {
                header = !inverse ? chalk.bgHex(theme256H).hex(black) : chalk.bgHex(black).hex(themeH)
                num = inverse ? chalk.bgHex(numBlack).hex(numWhite) : chalk.bgHex(numWhite).hex(numBlack)
                content = inverse ? chalk.bgHex(theme256H).hex(black) : chalk.bgHex(black).hex(themeH)
                hlight = header.hex("#a0a0a0")
            }
            break
            default: {
                header = chalk.bgBlack.white
                num = chalk.bgWhite.black
                content = chalk.bgBlack.white
                hlight = chalk.bgBlack.gray
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
        headerSemiColor:Chalk, defaultH:string, content:{title:string, content?:string}) {
        const prefix = content.content == null ? caller() : content.title
        let message = content.content == null ? content.title : content.content
        // set content width
        contentLimit = Math.max(5, process.stdout.columns - prefixLimit - numberLimit - totalBlank)
        if (message == null) {
            message = ""
        }
        if (message.split == null) {
            message = ""
        }
        // [20](prefix) [3](num) [1](|) [40+](content)
        const sends = message.split("\n").map((str, _i) => {
            const out:string[] = []
            while (str.length > 0) {
                let piece
                if (_i >= 1) {
                    piece = cutstr(str, contentLimit + prefixLimit + 1)
                } else {
                    piece = cutstr(str,contentLimit)
                }
                out.push(piece)
                str = str.replace(piece,"")
            }
            return out
        })
        let useNum = true
        if (sends.length === 0 || (sends.length === 1 && sends[0].length <= 1)) {
            // only one message
            useNum = false
        }
        let lines = 0 // all lines
        sends.forEach((value,index) => {
            value.forEach((_v,_i) => {
                lines += 1
                const useHeader =  lines % guidePtrn === 0 || (index === 0 && _i === 0)
                let numText = ""
                if (!useNum || (index === 0 && _i === 0)) {
                    numText = defaultH
                } else if (_i === 0) {
                    numText = (index + 1).toString()
                }
                if (index === 0 && _i === 0) {
                    _log(index === 0 ? headerColor : headerSemiColor, useHeader ? prefix.toString() : "",
                    numberColor, numText,
                    contentColor,_v)
                } else {
                    const column = process.stdout.columns
                    const trace = _v.padEnd(_v.length + (column - length(_v)) - 7)
                    let out = ""
                    out += headerColor(` ${numText.padStart(numberLimit)} `)
                    out += contentColor(` ${trace}${length(trace) >= column - numberLimit - 3 ? "" : " "}`)
                    out += "\n"
                    stdWrite(out)
                }
            })
        })
        // line for readability
        if (lines >= 10) {
            _log(numberColor, "",numberColor, "END",numberColor, "")
        }
    }
    /**
     * Hook console.log and console.error
     */
    export function hook() {
        const _hook = Hook(console, true)
        _hook.attach("log", (method, args) => {
            const str = Util.format.apply(this, args)
            Log.d("Legacy",str)
        })
        _hook.attach("error", (method, args) => {
            if (args.length >= 2) {
                Log.e(Util.format.apply(this, args))
            } else if (args.length === 1) {
                Log.e(args[0])
            }
        })
        ansi("2J")
        ansi("0;0H")
        ansi("?25l")
        setInterval(() => { }, 1 << 30)
        // ui = new Inquirer.ui.BottomBar();
    }
    /**
     * Read result.. or pink~
     * @param title Title or Content
     * @param content Content if exists
     */
    export function r(title:string, content:string) {
        custom("#ffcce3", "#ffcce3", chalk.bgBlack.white, "IME", {title, content})
    }
    /**
     * **async** Read string from stdin
     * @param title Title of input field
     * @param option Hide password / Log result auto.
     * @returns Readed string
     */
    export async function read(title:string, option = {hide:false, logResult:true},
            content?:string, need = true):Promise<string> {

        if (ui == null) {
            ui = new Inquirer.ui.BottomBar()
            // process.stdout.pipe(ui.log)
        }
        // update
        contentLimit = Math.max(5, process.stdout.columns - prefixLimit - numberLimit - totalBlank)
        // design
        const design_inv = style("#ffcce3","#ffcce3",chalk.bgBlack.white,true)
        const design_nor = style("#ffcce3","#ffcce3",chalk.bgBlack.white)
        const design_con = chalk.bgHex("#f78fb0").hex("#222222")

        // hide password
        let displayContent = ""
        if (content != null) {
            if (option.hide) {
                displayContent = content.replace(/[\S\s]/ig,"*")
            } else {
                displayContent = content
            }
        }
        const format = formatCursor(
            design_nor.header, title,
            design_inv.num, "IME",
            design_inv.content, displayContent
        , chalk.bgHex("#f7e1ea").hex("#e29ab9"))
        if (ui != null) {
            ui.updateBottomBar(format.echo)
        }
        // calc cursor
        ansi("254D", `${format.cursor}C`)

        if (need) {
            const stdin = process.stdin
            stdin.setRawMode(true)
            stdin.resume()
            ansi("?25h")
            // stdin.setEncoding("utf-8");
            return new Promise<string>((res,rej) => {
                const ime = new IME(title,content,option.hide,option.logResult,res,rej)
                process.stdin.on("data", ime.onData.bind(ime))
            })
        } else {
            return Promise.resolve("ok")
        }
    }
    /**
     * Log with cursor
     * @private
     * @param headerColor Header part color
     * @param headerMsg Header part string
     * @param numberColor Number part color
     * @param numberMsg Number part string
     * @param contentColor Content part color
     * @param contentMsg Content part string
     * @param cursorColor Cursor color
     * @returns ANSI formatted string with Cursor position
     */
    function formatCursor(headerColor:Chalk, headerMsg:string,
            numberColor:Chalk, numberMsg:string, contentColor:Chalk, contentMsg:string,
            cursorColor?:Chalk) {

        const format:string[] = []
        headerMsg = cutstr(headerMsg,prefixLimit)
        numberMsg = cutstr(numberMsg,numberLimit)
        // content
        contentMsg = Reverser.reverse(cutstr(Reverser.reverse(contentMsg), contentLimit - 1))
        if (contentLimit - length(contentMsg) > 0) {
            contentMsg = " " + contentMsg
        }
        const suffix = "".padEnd(contentLimit - length(contentMsg) + 1)

        format.push(headerColor(`${headerMsg.padStart(prefixLimit - unicodeLength(headerMsg))} `))
        format.push(numberColor(` ${numberMsg.padStart(numberLimit - unicodeLength(numberMsg))} `))
        format.push(contentColor(contentMsg))
        if (cursorColor != null) {
            format.push(cursorColor(" "))
        } else {
            format.push(contentColor(" "))
        }
        format.push(contentColor(suffix))
        const ln = prefixLimit + numberLimit + 3 + length(contentMsg)
        return {
            cursor: ln,
            echo: format.join(""),
        }
    }
    /**
     * Get formatted string.
     * @private
     * @param headerColor Header part color
     * @param headerMsg Header part string
     * @param numberColor Number part color
     * @param numberMsg Number part string
     * @param contentColor Content part color
     * @param contentMsg Content part string
     * @returns ANSI formatted string
     */
    function formatLog(headerColor:Chalk, headerMsg:string,
            numberColor:Chalk,numberMsg:string, contentColor:Chalk, contentMsg:string) {

        headerMsg = cutstr(headerMsg,prefixLimit)
        numberMsg = cutstr(numberMsg,numberLimit)
        contentMsg = cutstr(contentMsg,contentLimit)
        // totalBlank = 5;
        const format = []
        if (headerMsg != null) {
            format.push(headerColor(`${headerMsg.padStart(prefixLimit - unicodeLength(headerMsg))} `))
        }
        if (numberMsg != null) {
            format.push(numberColor(`${numberMsg.padStart(numberLimit - unicodeLength(numberMsg) + 1)} `))
        }
        if (contentMsg != null) {
            format.push(contentColor(` ${contentMsg.padEnd(contentLimit - unicodeLength(contentMsg) + 1)}`))
        }
        return format.join("")
    }
    /**
     * Log to stdout
     * @param headerColor Header part color
     * @param headerMsg Header part string
     * @param numberColor Number part color
     * @param numberMsg Number part string
     * @param contentColor Content part color
     * @param contentMsg Content part string
     */
    function _log(headerColor:Chalk, headerMsg:string,
        numberColor:Chalk, numberMsg:string, contentColor:Chalk, contentMsg:string) {
        const format = formatLog(headerColor,headerMsg,numberColor,numberMsg,contentColor,contentMsg)
        if (ui != null) {
            ui.log.write(format + "\n")
        } else {
            stdWrite(format + "\n")
        }
    }
    /**
     * Write raw ANSI code
     * @param code ansi code
     */
    function ansi(...code:string[]) {
        stdWrite(code.map((_v) => "\x1B[" + _v).join(""))
    }
    /**
     * Get caller
     */
    function caller() {
        let dp = 1
        let deeper
        do {
            deeper = _caller(dp)
            dp += 1
        } while ((deeper as string).endsWith("/log.js"))
        let out:string = path.resolve(deeper).replace(path.resolve(__dirname) + "/","")
        if (out.length >= prefixLimit) {
            out = `~${out.substr(out.lastIndexOf("/") + 1)}`
        }
        return out
    }
    /**
     * return length in console
     * @private
     * @param str string
     * @return shell length
     */
    function length(str:string) {
        if (str == null) {
            return 0
        }
        if (str.match(/[ -~]/ig) == null) {
            return str.length * 2
        }
        const asciis = str.match(/[ -~]/ig).length
        const unicodes =  unicodeLength(str)
        return asciis + 2 * unicodes
    }
    /**
     * Get unicode size of str
     * @private
     * @param str string
     */
    function unicodeLength(str:string) {
        return str.replace(/[ -~]/ig, "").length
    }
    /**
     * Substring with unicode size for console.
     * @private
     * @param str string
     * @param end the end of cut
     */
    function cutstr(str:string, end:number) {
        let ln = 0
        let k = 0
        if (str == null) {
            return null
        }
        for (const char of str.split("")) {
            const cn = char.charCodeAt(0)
            ln += (cn >= 32 && cn <= 126) ? 1 : 2
            k += 1
            if (ln >= end) {
                return str.substring(0, k)
            }
        }
        return str
    }
    export function stdWrite(buffer:string, cb?:() => void) {
        process.stdout.write(buffer, cb)
        /*
        if (Log.ui == null || cb != null) {
            process.stdout.write(buffer, cb)
        } else {
            Log.ui.write(buffer)
        }
        */
    }
}

export default Log

/**
 * Input keyboard event and show input with cursor
 * @private
 */
class IME {
    public mute:boolean = false
    private readonly timeout = 30
    private resolve
    private reject
    private time = this.timeout
    private timer
    private title
    private hide
    private logR
    private data:string[]
    constructor(title:string, defaultContent:string, hide:boolean, logR:boolean,
        res:(value:string | PromiseLike<string>) => void,rej:(reason:any) => void) {
        this.resolve = res
        this.reject = rej
        this.title = title
        this.hide = hide
        this.logR = logR
        this.data = []
        this.timer = setInterval(this.cancel,1000)
        if (defaultContent != null) {
            for (const letter of defaultContent.split("")) {
                this.data.push(letter)
            }
        }
    }
    public cancel() {
        if (this.time <= 0) {
            this.finish(false,"Timeout")
        } else {
            this.time -= 1
        }
    }
    public onData(key:Uint8Array) {
        clearTimeout(this.timer)
        let keycode = 0
        const ln = key.length - 1
        const str = key.toString()
        key.forEach((_v, _i) => {
            keycode += (_v << 16 * (ln - _i))
        })
        if (keycode >= 0xFFFFFF) {
            str.split("").forEach((_v) => {
                this.data.push(_v)
            })
            keycode = -1
        } else {
            keycode &= 0xFFFFFF
        }
        switch (keycode) {
            case 0x1B: {
                // Esc
                this.finish(false, "Cancel.")
                return
            }
            case 0x7F: {
                // Backspace
                if (this.data.length >= 1) {
                    this.data.pop()
                }
            } break
            case 0x4E00D9: {
                // Del
                if (this.data.length >= 1) {
                    this.data = []
                }
            } break
            case 0xD: {
                // Return or enter
                this.finish(true, this.data.join(""))
                return
            }
            default: {
                if (keycode !== -1) {
                    this.data.push(str)
                }
            }
        }
        this.time = this.timeout
        this.timer = setTimeout(this.cancel, 1000)
        Log.read(this.title, {hide:this.hide, logResult:this.logR}, this.data.join(""), false)
    }
    public finish(success:boolean, data:string) {
        if (Log.ui != null) {
            Log.ui.updateBottomBar("")
        }
        process.stdin.removeAllListeners("data")
        process.stdin.setRawMode(false)
        process.stdin.pause()
        if (this.logR) {
            Log.r(this.title,this.hide ? data.replace(/[\S\s]/ig,"*") : data)
        }
        if (Log.ui != null) {
            process.stdout.unpipe(Log.ui.log)
            Log.ui.close()
            Log.ui = null
            // ui.updateBottomBar("");
        }
        this.ansi("?25l")
        if (success) {
            this.resolve(data)
        } else {
            this.reject(data)
        }
    }
    private ansi(...code:string[]) {
        Log.stdWrite(code.map((_v) => "\x1B[" + _v).join(""))
    }
}