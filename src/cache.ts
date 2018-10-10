export default class Cache<T> {
    /**
     * Create cache with Generator
     * @param generator Generator Function
     * @param endOffset offset (**sec**)
     * @param day Current Time
     */
    public static fromGen<V>(generator:(old?:V) => V, endOffset:number, day = Date.now()) { 
        const obj = new Cache<V>(null, endOffset, day)
        obj.generator = generator
        return obj
    }
    private data:T
    private offset:number
    private ends:number
    private refreshFn:(old:T) => T
    /**
     * Create cache
     * @param target target
     * @param endOffset offset (**second**)
     */
    constructor(target:T,endOffset:number, day = Date.now()) {
        this.offset = endOffset * 1000
        this.data = target
        this.ends = day + this.offset
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
    public refresh() {
        if (this.refreshFn != null) {
            this.data = this.refreshFn(this.value)
            this.ends = Date.now() + this.offset
        }
    }
    public revoke(newV?:T) {
        this.ends = -1
        if (newV !== undefined) {
            this.data = newV
        }
    }
    private set generator(fn:(old?:T) => T) {
        this.refreshFn = fn
        this.refresh()
    }
}