import * as fs from "fs-extra"
import * as path from "path"
import * as request from "request-promise-native"
import { Stream } from "stream"
import NCredit from "../credit/ncredit"
import { CHAT_IMAGE_UPLOAD_URL, CHAT_IMAGE_UPLOADED_HOST, CHATAPI_PHOTO_SESSION_KEY } from "../ncconstant"
import { withName } from "../nccutil"
import NcJson from "./ncjson"

/**
 * yoo2001818
 * 
 * https://github.com/yoo2001818/node-ncc-es6/blob/master/src/uploadImage.js
 */

function getCallbackFn() {
  // Mimic Jindo's behaviour
  return 'tmpFrame_' + (Math.floor(Math.random() * 9000 + 1000) + '_func')
}

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
    const sessionKey = await credit.reqGet(CHATAPI_PHOTO_SESSION_KEY) as string
    // const sessionParse = new NcJson()
    const form = {
        "photo": withName(send, filename),
        "callback": "/html/AttachImageDummyCallback.html",
        "callback_func": getCallbackFn(),
    }
    const response = await credit.reqPost(CHAT_IMAGE_UPLOAD_URL, {}, form) as string
    const regex = /\]\)\('([^']+)'\);/
    const unpacks = regex.exec(response)
    if (unpacks.length < 2) {
      // Can we be more descriptive?
        return Promise.reject("File Transfer failed")
    }
    const unpacked = unpacks[1]
    const data = JSON.parse(unpacked)
    return {
        path: `${CHAT_IMAGE_UPLOADED_HOST}/${data.savedPath as string}`,
        fileSize: data.size as number,
        width: data.width as number,
        height: data.height as number,
    }
}