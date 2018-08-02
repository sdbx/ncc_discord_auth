import Log from "../log"
import NCredit from "./credit/ncredit"
import { CHATAPI_CAPTCHA, INSECURE_CAPTCHA, NID_CAPTCHA } from "./ncconstant"
import NcJson from "./talk/ncjson"

export default class NCaptcha {
    public static async gen(credit:NCredit) {
        const content = await credit.reqGet(CHATAPI_CAPTCHA)
        const response = new NcJson(content, (obj) => ({
            captchaKey: obj["captchaKey"],
            imageURL: obj["imageUrl"].replace(INSECURE_CAPTCHA, NID_CAPTCHA),
        }))
        const captcha = new NCaptcha()
        if (response.valid) {
            captcha.key = response.result.captchaKey
            captcha.url = response.result.imageURL
        } else {
            return Promise.reject("Wrong Data")
        }
        return captcha
    }
    public url:string
    public key:string
    public value:string
    private constructor() {
        this.value = ""
    }
    public randomString(length) {
        const rand = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz"
        let str = ""
        for (let i = 0; i < length; i += 1) {
            str += rand.charAt(Math.floor(Math.random() * rand.length))
        }
        return str
    }
}