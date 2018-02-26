package net.tarks.craftingmod.nccauth.discord;

import net.tarks.craftingmod.nccauth.Comment;
import net.tarks.craftingmod.nccauth.Config;

import java.util.ArrayList;

public interface ICommander {
    ArrayList<Comment> getComments(Config cfg, long timeLimit_sec);
}
