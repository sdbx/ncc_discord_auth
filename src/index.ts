import fetcher from "./fetcher";
import Config from "./structure/config";

fetcher.getComments(26686242,7212);
fetcher.getArticles(26686242);
const cfg:Config = new Config();
cfg.import(true);

console.log(fetcher.parseNaver("https"));

// cfg.export();
/*
fetcher.getWeb("http://cafe.naver.com/ArticleList.nhn", {
    'search.clubid':'26686242',
    'search.boardtype':'L'
})*/
