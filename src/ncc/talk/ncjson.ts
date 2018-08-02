import * as get from "get-value"
/**
 * JSON response from talkAPI
 */
export default class NcJson<T extends object> {
    public static default(response:object) {
        return new NcJson(response, (obj) => obj)
    }
    public status:string
    public error:NcError
    public result:T
    public constructor(response:object, parser:(obj:object) => T) {
        this.status = get(response, "message.status", {default: "-1"})
        this.error = get(response, "message.error") as NcError
        if (this.valid) {
            this.result = parser(get(response, "message.result"))
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