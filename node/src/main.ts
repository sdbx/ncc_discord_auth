import {fetcher} from './fetcher';
import * as Fetcher from './fetcher';

class Inner {
    public static main():number {
        console.log('hello world');
        return 0;
    }
}
Inner.main();
fetcher.getComments(26686242,7212);
/*
fetcher.getWeb("http://cafe.naver.com/ArticleList.nhn", {
    'search.clubid':'26686242',
    'search.boardtype':'L'
})*/