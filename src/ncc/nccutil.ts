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