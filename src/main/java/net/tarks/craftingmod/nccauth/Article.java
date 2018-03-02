package net.tarks.craftingmod.nccauth;

public class Article {
    public int id;
    public String title;
    public boolean hasFile;
    public boolean hasImage;
    public boolean hasVideo;
    public boolean question;
    public boolean hasVote;
    public String username;
    public String userID;
    public String link;
    public Article(){
        this(-1,null,null,null,null);
    }
    public Article(int _id,String title,String username,String userID,String link){
        hasFile = hasImage = hasVideo = question = hasVote = false;
        id = _id;
        this.title = title;
        this.username = username;
        this.userID = userID;
        this.link = link;
    }
}
