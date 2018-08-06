export default class Cache<T> {
    private data:T
    private offset:number
    private ends:number
    /**
     * Create cache
     * @param target target
     * @param endOffset offset (**second**)
     */
    constructor(target:T,endOffset:number) {
        this.data = target
        this.offset = endOffset * 1000
        this.ends = Date.now() + this.offset
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
    public revoke() {
        this.ends = -1
    }
}