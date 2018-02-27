package net.tarks.craftingmod.nccauth;

import java.util.ArrayList;

public class Config {
    public long cafeID;
    public long articleID;
    public String cafeCommentURL;
    public String discordToken;
    public long discordRoomID; // room id for management
    public long discordBotChID;
    public  long discordMainChID;
    public String discordToRolesName;
    public ArrayList<Long> trustedUsers;
    public String discordWelcomeMsg;
    public String discordAuthedMsg;
    public Config(String discord_token, String cafeURL){
        cafeID = -1;
        articleID = -1;
        discordToken = discord_token;
        discordRoomID = -1;
        discordToRolesName = "Roles name";
        cafeCommentURL = cafeURL;
        discordBotChID = -1;
        discordMainChID = -1;
        trustedUsers = new ArrayList<>();
        discordWelcomeMsg = "";
        discordAuthedMsg = "";
    }
    public void setID(long cfID,long arID){
        cafeID = cfID;
        articleID = arID;
    }
}
