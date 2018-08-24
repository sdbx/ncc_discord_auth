import Log from "../log"
import NCredit from "./credit/ncredit"
import { CHATAPI_CAPTCHA, INSECURE_CAPTCHA, NID_CAPTCHA } from "./ncconstant"
import NcJson from "./talk/ncjson"

/**
 * Naver Captcha class
 */
export default class NCaptcha {
    /**
     * Generate captcha from Logined token.
     * @param credit Naver Credit
     */
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
    /**
     * Generate Random Alphabetic String
     * @param length The length of return string
     * @param randKey Customize Possible Pattern?
     */
    public static randomString(length:number, randKey?:string) {
        const rand = randKey == null ? "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz" : randKey
        let str = ""
        for (let i = 0; i < length; i += 1) {
            str += rand.charAt(Math.floor(Math.random() * rand.length))
        }
        return str
    }
    /**
     * Image url
     */
    public url:string
    /**
     * Captcha key
     */
    public key:string
    /**
     * Captcha value
     * 
     * Need typing
     */
    public value:string
    private constructor() {
        this.value = ""
    }
}