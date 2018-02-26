package net.tarks.craftingmod.nccauth;

import java.time.Instant;

public class Comment {
    public String userID;
    public String nickname;
    public String content;
    public Instant timestamp;
    public Comment(String uID,String nick,String con,Instant ts){
        userID = uID;
        nickname = nick;
        content = con;
        timestamp = ts;
    }
    public Comment(){
        userID = null;
        nickname = null;
        content = null;
        timestamp = Instant.ofEpochMilli(0);
    }
    public long getTimeDelta(){
        return Instant.now().getEpochSecond() - timestamp.getEpochSecond();
    }
}
