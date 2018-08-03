import * as get from "get-value"
/**
 * JSON response from talkAPI
 */
export default class NcJson<T> {
    public static default(response:object) {
        return new NcJson(response, (obj) => obj)
    }
    public static fail(errormsg:string) {
        return new NcJson<undefined>({
            message: {
                status: "-1",
                error: {
                    code: "-1",
                    msg: errormsg,
                    errorResult: "",
                } as NcError
            }
        }, null)
    }
    public status:string
    public error:NcError
    public result:T
    public constructor(response:object | string, parser:(obj:any) => T) {
        let resObj:object
        if (typeof response === "string") {
            try {
                resObj = JSON.parse(response)
            } catch {
                return
            }
        } else {
            resObj = response
        }
        this.status = get(resObj, "message.status", {default: "-1"})
        this.error = get(resObj, "message.error") as NcError
        if (this.valid) {
            this.result = parser(get(resObj, "message.result"))
        }
    }
    public get valid() {
        return this.status === "200"
    }
}
interface NcError {
    code:string;
    msg:string;
    errorResult?:string;
}