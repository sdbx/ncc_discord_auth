import * as fs from "fs-extra"
import * as path from "path"
import request from "request-promise-native"
import { Stream } from "stream"
import NCredit from "../credit/ncredit"
import { CHAT_IMAGE_UPLOAD_URL, CHAT_IMAGE_UPLOADED_HOST, CHATAPI_PHOTO_SESSION_KEY } from "../ncconstant"
import { getFirst, parseFile, withName } from "../nccutil"
import NcJson from "./ncjson"

/**
 * Upload image to the server. This doesn't send image to the chat, though.
 * @param credit Naver Credentials
 * @param file File URL | File Path | File Buffer
 * @param filename Filename
 * @returns Image or Promise.reject()
 */
export default async function uploadImage(credit:NCredit, file:string | Buffer, filename:string = null) {
    const param = await parseFile(file, filename)
    if (param.filename == null || (param.sendable == null)) {
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
        "image": withName(param.sendable, param.filename),
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