import * as fs from "fs-extra"
import * as path from "path"
import * as request from "request-promise-native"
import { Stream } from "stream"
import NCredit from "../credit/ncredit"
import { CHAT_IMAGE_UPLOAD_URL, CHAT_IMAGE_UPLOADED_HOST, CHATAPI_PHOTO_SESSION_KEY } from "../ncconstant"
import { getFirst, withName } from "../nccutil"
import NcJson from "./ncjson"
import { NcImage } from "./ncmessage"

/**
 * Upload image to the server. This doesn't send image to the chat, though.
 * @param credit Naver Credentials
 * @param file File URL | File Path | File Buffer
 * @param filename Filename
 * @returns Image or Promise.reject()
 */
export default async function uploadImage(credit:NCredit, file:string | Buffer, filename:string = null) {
    let send:Buffer | Stream = null
    if (typeof file === "string") {
        if (/http(s)?:\/\//.test(file)) {
            if (filename == null) {
                filename = decodeURIComponent(file.replace(/\?.*/ig, ""))
                filename = filename.substring(filename.lastIndexOf("/") + 1)
            }
            send = await request.get(file, {encoding: null}).catch((err) => null)
        } else {
            const p = path.resolve(file)
            if (await fs.pathExists(p)) {
                if (filename == null) {
                    filename = path.basename(file)
                }
                send = fs.createReadStream(p)
            }
        }
    } else {
        send = file
    }
    if (filename == null || (send == null)) {
        return Promise.reject("Invalid file or filename")
    }
    const sessionRes = await credit.reqGet(CHATAPI_PHOTO_SESSION_KEY) as string
    const sessionKey = new NcJson<string>(sessionRes, (obj) => obj)
    if (!sessionKey.valid) {
        return Promise.reject("Failed getting session key")
    }
    const qs = {
        "userId": credit.username,
        "extractExif": false,
        "extractAnimatedCnt": false,
        "autorotate": false,
        "extractDominantColor": false,
        "type": "",
    }
    const form = {
        "image": withName(send, filename),
    }
    const content = await credit.reqPost(CHAT_IMAGE_UPLOAD_URL.get(sessionKey.result), qs, form) as string
    return {
        url: `${CHAT_IMAGE_UPLOADED_HOST}${queryXML(content, "url")}`,
        width: Number.parseInt(queryXML(content, "width")),
        height: Number.parseInt(queryXML(content, "height")),
        fileName: queryXML(content, "fileName"),
        fileSize: queryXML(content, "fileSize"),
        thumbnail: `${CHAT_IMAGE_UPLOADED_HOST}${queryXML(content, "thumbnail")}`,
    }
}
function queryXML(str:string, tag:string) {
    const filter = getFirst(str.match(new RegExp("^\\s*<" + tag + ">.+</", "im")))
    if (filter == null) {
        return null
    }
    return filter.substring(filter.indexOf(">") + 1, filter.lastIndexOf("<"))
}
/*
 * export interface NcImage {
    url:string; // nullable
    width:number; // nullable
    height:number; // nullable
    is_original_size?:boolean; // nullable
}
 */