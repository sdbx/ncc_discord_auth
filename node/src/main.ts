import {fetcher} from './fetcher';

class Inner {
    public static main():number {
        console.log('hello world');
        return 0;
    }
}
Inner.main();
/*
fetcher.getWeb("http://cafe.naver.com/ArticleList.nhn", {
    'search.clubid':'26686242',
    'search.boardtype':'L'
})*/
fetcher.getArticles(26686242);