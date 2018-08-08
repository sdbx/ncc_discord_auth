import Log from "../../log"
import NcJson from "./ncjson"

export default class NcAPIStatus {
    public static from<T>(response:NcJson<T>) {
        const err = new NcAPIStatus()
        err.success = response.valid
        try {
            if (!err.success) {
                for (const value of Object.values(NcErrorType)) {
                    if (response.error.code === value) {
                        err.errorType = value
                    }
                }
                err.errorMsg = response.error.msg
            }
        } catch (er) {
            err.errorMsg = er
            err.errorType = NcErrorType.unknown
        }
        return err
    }
    public static check(obj:any):obj is NcAPIStatus {
        return obj instanceof NcAPIStatus
    }
    public static error(id:NcErrorType, msg:string) {
        const err = new NcAPIStatus()
        err.success = false
        err.errorMsg = msg
        err.errorType = id
        return err
    }
    public static success() {
        const err = new NcAPIStatus()
        err.success = true
        err.errorMsg = null
        err.errorType = NcErrorType.unknown
        return err
    }
    public success:boolean = false
    public errorType:NcErrorType = NcErrorType.unknown
    public errorMsg:string
    public handleError() {
        if (!this.success) {
            Log.w("Error - NcAPI", this.errorMsg)
        }
    }
}
export enum NcErrorType {
    captchaFailed = "6002",
    cpatchaNeed = "6003",
    notCafeMember = "2002",
    notLogined = "1002",
    unknown = "1001",
    system = "-5353",
}