export function asJSON(str:string):object {
    let obj = null;
    try {
        obj = JSON.parse(str);
    } catch {
        // nothing.
    }
    return obj;
}
export function parseURL(str:string) {
    const out = {
        url: str.indexOf("?") >= 0 ? str.substring(0, str.indexOf("?")) : str,
        params: {} as { [key:string]: string },
    }
    if (str.indexOf("?") >= 0 && str.length > str.indexOf("?") + 1) {
        const params = str.substr(str.indexOf("?") + 1);
        params.split("&").map((v) => {
            if (v.indexOf("=") >= 0) {
                return [v.split("=")[0], v.split("=")[1]];
            } else {
                return [v, null];
            }
        }).filter(([p1, p2]) => p2 != null).forEach(([key, value]) => out.params[key] = value);
    }
    return out;
}
export function getFirst<T>(arr:T[]):T {
    if (arr != null && arr.length >= 1) {
        return arr[0];
    } else {
        return null;
    }
}
export function getFirstMap<T, V>(m:Map<T, V>):V {
    if (m != null && m.size >= 1) {
        for (const [k, v] of m) {
            return v;
        }
    }
    return null;
}
export function substrMatch(str:string, start:number | string[], end:number | string[],
    startOffset = 0, endOffset = 0) {
    if (Array.isArray(start)) {
        let n = -1;
        for (const value of start) {
            n = str.indexOf(value);
            if (n >= 0) {
                break;
            }
            n = -1;
        }
        if (n >= 0) {
            start = n;
        } else {
            start = 0;
        }
    }
    start = Math.max(0,start + startOffset);
    if (Array.isArray(end)) {
        let n = -1;
        for (const value of end) {
            n = str.lastIndexOf(value);
            if (n >= 0) {
                break;
            }
            n = -1;
        }
        if (n >= 0) {
            end = n;
        } else {
            end = str.length - 1;
        }
    }
    end = Math.min(str.length, end + endOffset);
    return str.substring(start, end);
}