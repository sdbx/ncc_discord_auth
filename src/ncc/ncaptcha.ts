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
        captcha.key = response.result.captchaKey
        captcha.url = response.result.imageURL
        return captcha
    }
    public url:string
    public key:string
    public value:string
    private constructor() {
        this.value = ""
    }
}