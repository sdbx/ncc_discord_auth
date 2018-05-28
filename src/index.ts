import Fetcher from "./fetcher";
import Config from "./structure/config";

Fetcher.getComments(26686242,7212);
Fetcher.getArticles(26686242);
const cfg:Config = new Config();
cfg.import(true);

async function test() {
    console.log(JSON.stringify(await Fetcher.parseNaver("http://cafe.naver.com/sdbx/7157")));
}
test();

// cfg.export();
/*
fetcher.getWeb("http://cafe.naver.com/ArticleList.nhn", {
    'search.clubid':'26686242',
    'search.boardtype':'L'
})*/
