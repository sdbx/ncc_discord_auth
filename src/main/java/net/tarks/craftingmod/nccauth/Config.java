package net.tarks.craftingmod.nccauth;

public class Config {
    public long cafeID;
    public long articleID;
    public String cafeCommentURL;
    public String discordToken;
    public long discordRoomID; // room id for management
    public long discordBotChID;
    public String discordToRolesName;
    public Config(long cid,long aid, String discord_token, long discord_mainID,long discord_channelID, String discord_rolesName, String cafeURL){
        cafeID = cid;
        articleID = aid;
        discordToken = discord_token;
        discordRoomID = discord_mainID;
        discordToRolesName = discord_rolesName;
        cafeCommentURL = cafeURL;
        discordBotChID = discord_channelID;
    }
    public void setID(long cfID,long arID){
        cafeID = cfID;
        articleID = arID;
    }
}
