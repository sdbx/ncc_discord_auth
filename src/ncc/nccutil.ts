import * as fs from "fs-extra"
import * as get from "get-value"
import * as mime from "mime-types"
import * as path from "path"
import * as request from "request-promise-native"
import { Stream } from "stream"
import Log from "../log"
import Cafe from "./structure/cafe"
import Profile from "./structure/profile"
import NcAPIStatus from "./talk/ncapistatus"

export function asJSON(str:string):object {
    let obj = null
    try {
        obj = JSON.parse(str)
    } catch {
        // nothing.
    }
    return obj
}
export function parseURL(str:string) {
    const out = {
        url: str.indexOf("?") >= 0 ? str.substring(0, str.indexOf("?")) : str,
        params: {} as { [key:string]: string },
    }
    if (str.indexOf("?") >= 0 && str.length > str.indexOf("?") + 1) {
        const params = str.substr(str.indexOf("?") + 1)
        params.split("&").map((v) => {
            if (v.indexOf("=") >= 0) {
                return [v.split("=")[0], v.split("=")[1]]
            } else {
                return [v, null]
            }
        }).filter(([p1, p2]) => p2 != null).forEach(([key, value]) => out.params[key] = value)
    }
    return out
}
export function getFirst<T>(arr:T[], filter:(v:T) => boolean = () => true):T {
    if (arr != null && arr.length >= 1) {
        const size = arr.length
        for (let i = 0; i < size; ++i) {
            if (filter(arr[i])) {
                return arr[i]
            }
        }
    }
    return null
}
export function getFirstMap<T, V>(m:Map<T, V>):V {
    if (m != null && m.size >= 1) {
        for (const [k, v] of m) {
            return v
        }
    }
    return null
}
export function substrMatch(str:string, start:number | string[], end:number | string[],
    startOffset = 0, endOffset = 0) {
    if (Array.isArray(start)) {
        let n = -1
        for (const value of start) {
            n = str.indexOf(value)
            if (n >= 0) {
                break
            }
            n = -1
        }
        if (n >= 0) {
            start = n
        } else {
            start = 0
        }
    }
    start = Math.max(0,start + startOffset)
    if (Array.isArray(end)) {
        let n = -1
        for (const value of end) {
            n = str.lastIndexOf(value)
            if (n >= 0) {
                break
            }
            n = -1
        }
        if (n >= 0) {
            end = n
        } else {
            end = str.length - 1
        }
    }
    end = Math.min(str.length, end + endOffset)
    return str.substring(start, end)
}
export function parseMember(json:object, cafe:Cafe) {
    return {
        ...this.cafe,
        profileurl: get(json, "memberProfileImageUrl"),
        nickname: get(json, "nickname"),
        userid: get(json, "memberId"),
    } as Profile
}
/**
 * Form-data maker
 * @param value string, stream, buffer
 * @param filename extension or buffer
 */
export function withName<T>(value:T, filename:string = null) {
    if (filename == null) {
        return value
    }
    if (filename.indexOf(".") <= 0) {
        filename = "unknown" + filename.substr(filename.indexOf(".") + 1)
    }
   const contentType = mime.lookup(filename) || "application/octet-stream"
   return {
       value,
       options: {
           filename,
           contentType
       }
   }
}
/**
 * Get sendable file from parameter
 * 
 * Result can be null
 * @param file File URL | File Path | File Buffer
 * @param filename File's name
 */
export async function parseFile(file:string | Buffer, filename:string = null, defaultFileName = "unknown.png") {
    let send:Buffer | Stream = null
    let filesize:number = -1
    if (typeof file === "string") {
        if (/http(s)?:\/\//.test(file)) {
            if (filename == null) {
                filename = decodeURIComponent(file.replace(/\?.*/ig, ""))
                filename = filename.substring(filename.lastIndexOf("/") + 1)
            }
            send = await request.get(file, {encoding: null}).catch((err) => null)
            filesize = (send as Buffer).byteLength
        } else {
            file = file.replace(/\\\s/ig, " ")
            const p = path.resolve(file)
            if (await fs.pathExists(p)) {
                filesize = (await fs.stat(p)).size
                if (filename == null) {
                    filename = path.basename(file)
                }
                send = fs.createReadStream(p)
            }
        }
    } else {
        if (filename == null) {
            filename = defaultFileName
        }
        send = file
    }
    return {
        sendable:send,
        filename,
        filesize,
    }
}
export class ParamStr {
    public static make(str:string) {
        return new ParamStr(str)
    }
    private readonly content:string
    constructor(c:string) {
        this.content = c
    }
    public get(...args:Array<string | number | boolean>) {
        let value = this.content
        args.map((v) => encodeURIComponent(v.toString())).forEach((v) => value = value.replace("$",v))
        return value
    }
    public get origin() {
        return this.content
    }
    public toString() {
        return this.content
    }
}