export type TimerID = NodeJS.Timer | number
// tslint:disable-next-line
export class WebpackTimer {
    // tslint:disable-next-line
    public static setTimeout<T extends Function>(fn:T, ms:number, ...args:any[]):TimerID {
        return setTimeout(fn, ms, ...args)
    }
    // tslint:disable-next-line
    public static setInterval<T extends Function>(fn:T, ms:number, ...args:any[]):TimerID {
        return setInterval(fn, ms, ...args)
    }
    // tslint:disable-next-line
    public static clearTimeout<T extends Function>(timerId:TimerID) {
        return clearTimeout(timerId as any)
    }
    // tslint:disable-next-line
    public static clearInterval<T extends Function>(timerId:TimerID) {
        return clearInterval(timerId as any)
    }
}
/**
 * Bind Function to bindObj
 * 
 * NodeJS's timer..
 * @param fn Function
 * @param bindObj Binded object
 */
// tslint:disable-next-line
export function bindFn<T extends Function>(fn:T, bindObj:any):T {
    return fn.bind(bindObj)
}