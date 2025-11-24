import { users, rooms, roomMembers, messages, reactions } from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export class DatabaseStorage {
  // User methods
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByWallet(walletAddress) {
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress));
    return user || undefined;
  }

  async createUser(insertUser) {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Room methods
  async getRoom(id) {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room || undefined;
  }

  async getUserRooms(userId) {
    const userRooms = await db
      .select({ room: rooms })
      .from(roomMembers)
      .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
      .where(eq(roomMembers.userId, userId));
    
    return userRooms.map(r => r.room);
  }

  async createRoom(insertRoom) {
    const [room] = await db
      .insert(rooms)
      .values(insertRoom)
      .returning();
    return room;
  }

  async ensurePublicRoom() {
    const [publicRoom] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.isPublic, true));
    
    if (publicRoom) {
      return publicRoom;
    }
    
    const [newPublicRoom] = await db
      .insert(rooms)
      .values({
        name: 'Public Chat',
        isGroup: true,
        isPublic: true,
        createdBy: null,
      })
      .returning();
    
    return newPublicRoom;
  }

  async findPrivateRoom(userId1, userId2) {
    // Find a non-group, non-public room where both users are members
    const userRooms = await db
      .select({ room: rooms })
      .from(roomMembers)
      .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
      .where(
        and(
          eq(roomMembers.userId, userId1),
          eq(rooms.isGroup, false),
          eq(rooms.isPublic, false)
        )
      );
    
    // Check each room to see if userId2 is also a member
    for (const { room } of userRooms) {
      const isMember = await this.isRoomMember(room.id, userId2);
      if (isMember) {
        return room;
      }
    }
    
    return null;
  }

  // Room member methods
  async addRoomMember(roomId, userId) {
    await db
      .insert(roomMembers)
      .values({ roomId, userId });
  }

  async getRoomMembers(roomId) {
    const members = await db
      .select({ user: users })
      .from(roomMembers)
      .innerJoin(users, eq(roomMembers.userId, users.id))
      .where(eq(roomMembers.roomId, roomId));
    
    return members.map(m => m.user);
  }

  async isRoomMember(roomId, userId) {
    const [member] = await db
      .select()
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
    
    return !!member;
  }

  // Message methods
  async createMessage(insertMessage) {
    const [message] = await db
      .insert(messages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async getRoomMessages(roomId, limit = 50) {
    const roomMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    
    return roomMessages.reverse();
  }

  async deleteExpiredMessages() {
    const now = new Date();
    const result = await db
      .delete(messages)
      .where(and(
        sql`${messages.expiresAt} IS NOT NULL`,
        sql`${messages.expiresAt} <= ${now}`
      ))
      .returning();
    
    return result.length;
  }

  // Reaction methods
  async addReaction(messageId, userId, emoji) {
    // Check if reaction already exists
    const [existing] = await db
      .select()
      .from(reactions)
      .where(and(
        eq(reactions.messageId, messageId),
        eq(reactions.userId, userId),
        eq(reactions.emoji, emoji)
      ));
    
    if (existing) {
      return existing;
    }
    
    const [reaction] = await db
      .insert(reactions)
      .values({ messageId, userId, emoji })
      .returning();
    
    return reaction;
  }

  async removeReaction(messageId, userId, emoji) {
    const result = await db
      .delete(reactions)
      .where(and(
        eq(reactions.messageId, messageId),
        eq(reactions.userId, userId),
        eq(reactions.emoji, emoji)
      ))
      .returning();
    
    return result.length > 0;
  }

  async getMessageReactions(messageId) {
    const messageReactions = await db
      .select({
        reaction: reactions,
        user: users
      })
      .from(reactions)
      .innerJoin(users, eq(reactions.userId, users.id))
      .where(eq(reactions.messageId, messageId));
    
    return messageReactions.map(r => ({
      ...r.reaction,
      username: r.user.username,
      walletAddress: r.user.walletAddress
    }));
  }

  async getMessagesReactions(messageIds) {
    if (messageIds.length === 0) {
      return [];
    }
    
    const messageReactions = await db
      .select({
        reaction: reactions,
        user: users
      })
      .from(reactions)
      .innerJoin(users, eq(reactions.userId, users.id))
      .where(inArray(reactions.messageId, messageIds));
    
    return messageReactions.map(r => ({
      ...r.reaction,
      username: r.user.username,
      walletAddress: r.user.walletAddress
    }));
  }

  // User Statistics
  async getUserMessageCount(userId) {
    const result = await db
      .select({ count: sql`count(*)::int` })
      .from(messages)
      .where(eq(messages.userId, userId));
    
    return result[0]?.count || 0;
  }

  async getUserActivityStats(userId, days = 7) {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    
    const result = await db
      .select({
        date: sql`DATE(${messages.createdAt})`.as('date'),
        count: sql`count(*)::int`.as('count')
      })
      .from(messages)
      .where(and(
        eq(messages.userId, userId),
        sql`${messages.createdAt} >= ${daysAgo.toISOString()}`
      ))
      .groupBy(sql`DATE(${messages.createdAt})`)
      .orderBy(sql`DATE(${messages.createdAt})`);
    
    // Create a map of all days in the range
    const activityMap = {};
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateStr = date.toISOString().split('T')[0];
      activityMap[dateStr] = 0;
    }
    
    // Fill in actual counts
    result.forEach(row => {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      if (activityMap.hasOwnProperty(dateStr)) {
        activityMap[dateStr] = row.count;
      }
    });
    
    return Object.entries(activityMap).map(([date, count]) => ({ date, count }));
  }
}

export const storage = new DatabaseStorage();
