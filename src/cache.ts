export default class Cache<T> {
    private data:T
    private offset:number
    private ends:number
    private refreshFn:(old:T) => T
    /**
     * Create cache
     * @param target target
     * @param endOffset offset (**second**)
     */
    constructor(target:T | ((old:T) => T),endOffset:number) {
        this.offset = endOffset * 1000
        if (typeof target === "function") {
            this.refresh = target
            this.doRefresh()
        } else {
            this.data = target
            this.ends = Date.now() + this.offset
        }
    }
    public get value():T {
        return this.data
    }
    public get cache():T {
        return this.data
    }
    public set cache(pm:T) {
        this.data = pm
        this.ends = Date.now() + this.offset
    }
    public get expired() {
        return Date.now() > this.ends
    }
    public set refresh(value:(old:T) => T) {
        this.refreshFn = value
    }
    public get refresh() {
        if (this.refreshFn != null) {
            this.data = this.refreshFn(this.value)
            this.ends = Date.now() + this.offset
        }
        return this.refreshFn
    }
    public doRefresh() {
        // tslint:disable-next-line
        this.refresh
    }
    public revoke() {
        this.ends = -1
    }
}