import Fetcher from "./fetcher";
import Config from "./structure/config";

Fetcher.getComments(26686242,7212);
Fetcher.getArticles(26686242);
class InterConfig extends Config {
    public kkiro:string = "babu";
    public jjo:string = "umran";
    public ludev = {think:"babu"}
    constructor() {
        super("test");
    }
}
const cfg:InterConfig = new InterConfig();

async function test() {
    await cfg.import();
    console.log(cfg.jjo);
    console.log(cfg.ludev.think);
    await cfg.export();
    console.log(JSON.stringify(await Fetcher.parseNaver("http://cafe.naver.com/sdbx/7157")));
}
test();

// cfg.export();
/*
fetcher.getWeb("http://cafe.naver.com/ArticleList.nhn", {
    'search.clubid':'26686242',
    'search.boardtype':'L'
})*/
