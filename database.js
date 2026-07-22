const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  doc, 
  collection, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  runTransaction,
  writeBatch
} = require('firebase/firestore');
const firebaseConfig = require('./firebase-applet-config.json');

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);

class DocRefWrapper {
  constructor(path, firestoreDocRef) {
    this.path = path;
    this.ref = firestoreDocRef;
  }

  get id() {
    return this.ref.id;
  }

  async get() {
    const snap = await getDoc(this.ref);
    return {
      exists: snap.exists(),
      data: () => snap.data(),
      id: snap.id
    };
  }

  async set(data, options) {
    await setDoc(this.ref, data, options);
  }

  async update(data) {
    await updateDoc(this.ref, data);
  }

  async delete() {
    await deleteDoc(this.ref);
  }
}

class DocumentSnapshotWrapper {
  constructor(docSnap, collectionPath) {
    this.snap = docSnap;
    this.collectionPath = collectionPath;
  }

  get id() { return this.snap.id; }
  get exists() { return this.snap.exists(); }
  data() { return this.snap.data(); }
  get ref() {
    return new DocRefWrapper(`${this.collectionPath}/${this.snap.id}`, this.snap.ref);
  }
}

class QuerySnapshotWrapper {
  constructor(firestoreQuerySnapshot, collectionPath) {
    this.snap = firestoreQuerySnapshot;
    this.collectionPath = collectionPath;
  }

  get size() { return this.snap.size; }
  get empty() { return this.snap.empty; }
  get docs() {
    return this.snap.docs.map(docSnap => new DocumentSnapshotWrapper(docSnap, this.collectionPath));
  }

  forEach(callback) {
    this.docs.forEach(doc => callback(doc));
  }
}

class QueryWrapper {
  constructor(firestoreQuery, collectionPath) {
    this.firestoreQuery = firestoreQuery;
    this.collectionPath = collectionPath;
  }

  where(field, op, val) {
    return new QueryWrapper(query(this.firestoreQuery, where(field, op, val)), this.collectionPath);
  }

  orderBy(field, direction) {
    return new QueryWrapper(query(this.firestoreQuery, orderBy(field, direction)), this.collectionPath);
  }

  limit(n) {
    return new QueryWrapper(query(this.firestoreQuery, limit(n)), this.collectionPath);
  }

  async get() {
    const snap = await getDocs(this.firestoreQuery);
    return new QuerySnapshotWrapper(snap, this.collectionPath);
  }

  doc(docId) {
    if (docId) {
      const docRef = doc(firestore, this.collectionPath, docId);
      return new DocRefWrapper(`${this.collectionPath}/${docId}`, docRef);
    } else {
      const colRef = collection(firestore, this.collectionPath);
      const docRef = doc(colRef);
      return new DocRefWrapper(`${this.collectionPath}/${docRef.id}`, docRef);
    }
  }
}

class TransactionWrapper {
  constructor(t) {
    this.t = t;
  }

  async get(docRefWrapper) {
    const snap = await this.t.get(docRefWrapper.ref);
    return {
      exists: snap.exists(),
      data: () => snap.data(),
      id: snap.id
    };
  }

  set(docRefWrapper, data, options) {
    this.t.set(docRefWrapper.ref, data, options);
    return this;
  }

  update(docRefWrapper, data) {
    this.t.update(docRefWrapper.ref, data);
    return this;
  }

  delete(docRefWrapper) {
    this.t.delete(docRefWrapper.ref);
    return this;
  }
}

class BatchWrapper {
  constructor() {
    this.batch = writeBatch(firestore);
  }

  set(docRefWrapper, data, options) {
    this.batch.set(docRefWrapper.ref, data, options);
    return this;
  }

  update(docRefWrapper, data) {
    this.batch.update(docRefWrapper.ref, data);
    return this;
  }

  delete(docRefWrapper) {
    this.batch.delete(docRefWrapper.ref);
    return this;
  }

  async commit() {
    await this.batch.commit();
  }
}

const db = {
  collection(collectionPath) {
    const colRef = collection(firestore, collectionPath);
    return new QueryWrapper(colRef, collectionPath);
  },

  batch() {
    return new BatchWrapper();
  },

  async runTransaction(updateFunction) {
    return await runTransaction(firestore, async (t) => {
      const wrappedTransaction = new TransactionWrapper(t);
      return await updateFunction(wrappedTransaction);
    });
  }
};

// Normalizes user fields to support camelCase and snake_case properties seamlessly
function normalizeUser(dbUser) {
  if (!dbUser) return null;
  const mainBalance = typeof dbUser.main_balance === 'number' ? dbUser.main_balance : parseFloat(dbUser.main_balance || 0);
  const playBalance = typeof dbUser.play_balance === 'number' ? dbUser.play_balance : parseFloat(dbUser.play_balance || 0);
  const totalDeposited = typeof dbUser.total_deposited === 'number' ? dbUser.total_deposited : parseFloat(dbUser.total_deposited || 0);
  const totalWagered = typeof dbUser.total_wagered === 'number' ? dbUser.total_wagered : parseFloat(dbUser.total_wagered || 0);
  const requiredWager = totalDeposited * 15;
  const minDepositMet = totalDeposited >= 50;
  const wageringCompleted = totalWagered >= requiredWager;

  return {
    ...dbUser,
    userId: dbUser.user_id,
    firstName: dbUser.first_name,
    mainBalance: mainBalance,
    playBalance: playBalance,
    totalDeposited: totalDeposited,
    totalWagered: totalWagered,
    requiredWager: requiredWager,
    minDepositMet: minDepositMet,
    wageringCompleted: wageringCompleted,
    gamesPlayed: dbUser.games_played || 0,
    gamesWon: dbUser.games_won || 0,
    totalWon: dbUser.total_won || 0,
    invited: dbUser.invited || 0,
    isVip: dbUser.is_vip || false,
    currentStreak: dbUser.current_streak || 0,
    highestStreak: dbUser.highest_streak || 0,
    mainBalanceValue: mainBalance,
    playBalanceValue: playBalance,
    status: dbUser.status || 'active',
    banReason: dbUser.ban_reason || ''
  };
}

// In-Memory Database Fallback Store (only used if Firestore fails)
const memoryDb = {
  users: {},
  transactions: [],
  gameHistory: []
};

function getMemoryUser(userId) {
  if (!memoryDb.users[userId]) {
    memoryDb.users[userId] = {
      user_id: userId,
      first_name: '',
      username: '',
      main_balance: 0,
      play_balance: 50,
      games_played: 0,
      games_won: 0,
      total_won: 0,
      invited: Math.floor(Math.random() * 5),
      is_vip: false,
      current_streak: 0,
      highest_streak: 0,
      status: 'active'
    };
  }
  return memoryDb.users[userId];
}

module.exports = {
  db,
  
  async getUser(userId) {
    try {
      const docRef = db.collection('users').doc(userId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        // User not found, create one
        const newUser = {
          user_id: userId,
          play_balance: 50,
          main_balance: 0,
          games_played: 0,
          games_won: 0,
          total_won: 0,
          invited: Math.floor(Math.random() * 5),
          is_vip: false,
          current_streak: 0,
          highest_streak: 0,
          status: 'active',
          ban_reason: ''
        };
        await docRef.set(newUser);
        return normalizeUser(newUser);
      }
      return normalizeUser(docSnap.data());
    } catch (err) {
      console.error('Admin SDK getUser error:', err);
      return normalizeUser(getMemoryUser(userId));
    }
  },

  async registerWebUser(userId, password, name) {
    try {
      const docRef = db.collection('users').doc(userId);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        return null;
      }
      const newUser = {
        user_id: userId,
        username: '__pwd__:' + password,
        first_name: name || 'Web User',
        play_balance: 50,
        main_balance: 0,
        games_played: 0,
        games_won: 0,
        total_won: 0,
        invited: Math.floor(Math.random() * 5),
        is_vip: false,
        current_streak: 0,
        highest_streak: 0,
        status: 'active',
        ban_reason: ''
      };
      await docRef.set(newUser);
      return normalizeUser(newUser);
    } catch (err) {
      console.error('Admin SDK registerWebUser error:', err);
      return null;
    }
  },

  async setUserPassword(userId, password) {
    try {
      const docRef = db.collection('users').doc(userId);
      await docRef.set({
        username: '__pwd__:' + password
      }, { merge: true });
    } catch (err) {
      console.error('Admin SDK setUserPassword error:', err);
    }
  },

  async loginWebUser(userId, password) {
    try {
      const docRef = db.collection('users').doc(userId);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const user = docSnap.data();
        if (user.username === '__pwd__:' + password) {
          return normalizeUser(user);
        }
      }
      return null;
    } catch (err) {
      console.error('Admin SDK loginWebUser error:', err);
      return null;
    }
  },

  async updateUserName(userId, firstName, username) {
    try {
      const docRef = db.collection('users').doc(userId);
      await docRef.set({
        first_name: firstName,
        username: username
      }, { merge: true });
    } catch (err) {
      console.error('Admin SDK updateUserName error:', err);
    }
  },

  async deductBet(userId, amount) {
    try {
      const docRef = db.collection('users').doc(userId);
      const result = await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists) return null;
        
        const user = docSnap.data();
        let play = parseFloat(user.play_balance || 0);
        let main = parseFloat(user.main_balance || 0);
        let totalWagered = parseFloat(user.total_wagered || 0) + amount;
        
        if (play + main < amount) return null;
        
        if (play >= amount) {
          play -= amount;
        } else {
          main -= (amount - play);
          play = 0;
        }
        
        transaction.update(docRef, {
          play_balance: play,
          main_balance: main,
          total_wagered: totalWagered
        });
        
        return { play, main, totalWagered, user };
      });
      
      if (!result) return null;
      
      const txDocRef = db.collection('transactions').doc();
      await txDocRef.set({
        user_id: userId,
        type: 'bet',
        amount: amount,
        status: 'Done',
        time: new Date().toISOString()
      });
      
      return normalizeUser({
        ...result.user,
        play_balance: result.play,
        main_balance: result.main,
        total_wagered: result.totalWagered
      });
    } catch (err) {
      console.error('Admin SDK deductBet error:', err);
      return null;
    }
  },

  async addWin(userId, amount, gameId) {
    try {
      const docRef = db.collection('users').doc(userId);
      const result = await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists) return null;
        
        const user = docSnap.data();
        const newMain = parseFloat(user.main_balance || 0) + amount;
        const newGamesWon = parseInt(user.games_won || 0) + 1;
        const newTotalWon = parseFloat(user.total_won || 0) + amount;
        
        transaction.update(docRef, {
          main_balance: newMain,
          games_won: newGamesWon,
          total_won: newTotalWon
        });
        
        return { ...user, main_balance: newMain, games_won: newGamesWon, total_won: newTotalWon };
      });
      
      if (!result) return null;
      
      const txDocRef = db.collection('transactions').doc();
      await txDocRef.set({
        user_id: userId,
        type: 'bingo_win',
        amount: amount,
        status: 'Done',
        time: new Date().toISOString()
      });
      
      const querySnap = await db.collection('game_history')
        .where('user_id', '==', userId)
        .where('game_id', '==', gameId)
        .get();
        
      const batch = db.batch();
      querySnap.forEach(snap => {
        batch.update(snap.ref, { result: '+' + amount + ' Br' });
      });
      await batch.commit();
      
      return normalizeUser(result);
    } catch (err) {
      console.error('Admin SDK addWin error:', err);
      return null;
    }
  },

  async recordGamePlayed(userId, gameId, cardsCount, stake) {
    try {
      const docRef = db.collection('users').doc(userId);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const user = docSnap.data();
        await docRef.update({
          games_played: parseInt(user.games_played || 0) + 1
        });
      }
      
      const histDocRef = db.collection('game_history').doc();
      await histDocRef.set({
        user_id: userId,
        game_id: gameId,
        entry: cardsCount * stake,
        status: 'Completed',
        result: '-',
        time: new Date().toISOString()
      });
    } catch (err) {
      console.error('Admin SDK recordGamePlayed error:', err);
    }
  },

  async getGameHistory(userId) {
    try {
      const querySnap = await db.collection('game_history')
        .where('user_id', '==', userId)
        .get();
        
      const history = [];
      querySnap.forEach(snap => {
        history.push(snap.data());
      });
      
      history.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
      
      return history.slice(0, 10).map(d => ({
        game_id: d.game_id,
        entry: d.entry,
        status: d.status,
        result: d.result,
        time: d.time
      }));
    } catch (err) {
      console.error('Admin SDK getGameHistory error:', err);
      return [];
    }
  },

  async getTransactions(userId) {
    try {
      const querySnap = await db.collection('transactions')
        .where('user_id', '==', userId)
        .get();
        
      const transactions = [];
      querySnap.forEach(snap => {
        transactions.push(snap.data());
      });
      
      transactions.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
      
      return transactions.slice(0, 20).map(d => ({
        type: d.type,
        amount: d.amount,
        status: d.status || 'Done',
        time: d.time
      }));
    } catch (err) {
      console.error('Admin SDK getTransactions error:', err);
      return [];
    }
  },

  async getProfileStats(userId) {
    try {
      const docRef = db.collection('users').doc(userId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) return null;
      const user = docSnap.data();
      return {
        games_played: user.games_played || 0,
        games_won: user.games_won || 0,
        total_won: user.total_won || 0,
        invited: user.invited || 0,
        is_vip: user.is_vip || false,
        current_streak: user.current_streak || 0,
        highest_streak: user.highest_streak || 0
      };
    } catch (err) {
      console.error('Admin SDK getProfileStats error:', err);
      return null;
    }
  },

  async updateUserStreak(userId, won) {
    try {
      const docRef = db.collection('users').doc(userId);
      await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists) return;
        const user = docSnap.data();
        let current = parseInt(user.current_streak || 0);
        let highest = parseInt(user.highest_streak || 0);
        if (won) {
          current += 1;
          if (current > highest) {
            highest = current;
          }
        } else {
          current = 0;
        }
        transaction.update(docRef, {
          current_streak: current,
          highest_streak: highest
        });
      });
    } catch (err) {
      console.error('Admin SDK updateUserStreak error:', err);
    }
  },

  async getTopWinners(period, category) {
    try {
      let orderBy = 'total_won';
      if (category === 'deposit') orderBy = 'main_balance';
      if (category === 'invite') orderBy = 'invited';
      if (category === 'games') orderBy = 'games_played';
      if (category === 'wins') orderBy = 'total_won';
      
      const querySnap = await db.collection('users').get();
      const users = [];
      querySnap.forEach(snap => {
        users.push(snap.data());
      });
      
      users.sort((a, b) => parseFloat(b[orderBy] || 0) - parseFloat(a[orderBy] || 0));
      
      return users.slice(0, 30).map(u => {
        let displayName = u.first_name;
        if (!displayName && u.username) {
          if (u.username.startsWith('__pwd__:')) {
            displayName = 'Web User ' + (u.user_id ? String(u.user_id).slice(-6) : '');
          } else {
            displayName = u.username;
          }
        }
        if (!displayName) displayName = u.user_id ? ('User ' + String(u.user_id).slice(-4)) : 'Anonymous';
        return {
          user_id: u.user_id,
          name: displayName,
          value: parseFloat(u[orderBy] || 0)
        };
      });
    } catch (err) {
      console.error('Admin SDK getTopWinners error:', err);
      return [];
    }
  },

  async getMyRank(userId, period, category) {
    try {
      let orderBy = 'total_won';
      if (category === 'deposit') orderBy = 'main_balance';
      if (category === 'invite') orderBy = 'invited';
      if (category === 'games') orderBy = 'games_played';
      if (category === 'wins') orderBy = 'total_won';
      
      const querySnap = await db.collection('users').get();
      const users = [];
      querySnap.forEach(snap => {
        users.push(snap.data());
      });
      
      users.sort((a, b) => parseFloat(b[orderBy] || 0) - parseFloat(a[orderBy] || 0));
      
      const targetId = String(userId).trim();
      const rankIdx = users.findIndex(u => String(u.user_id).trim() === targetId);
      if (rankIdx !== -1) {
        return {
          rank: rankIdx + 1,
          value: parseFloat(users[rankIdx][orderBy] || 0)
        };
      }
      return { rank: null, value: 0 };
    } catch (err) {
      console.error('Admin SDK getMyRank error:', err);
      return { rank: null, value: 0 };
    }
  },

  // ================= ADMIN & SYSTEM SETTINGS OPERATIONS =================

  async getAllUsers() {
    try {
      const snap = await db.collection('users').get();
      const users = [];
      snap.forEach(doc => {
        users.push(normalizeUser(doc.data()));
      });
      return users;
    } catch (err) {
      console.error('Admin SDK getAllUsers error:', err);
      return [];
    }
  },

  async updateUserByAdmin(userId, data) {
    try {
      const docRef = db.collection('users').doc(userId);
      const updatePayload = {};
      
      if (data.first_name !== undefined) updatePayload.first_name = data.first_name;
      if (data.main_balance !== undefined) updatePayload.main_balance = parseFloat(data.main_balance || 0);
      if (data.play_balance !== undefined) updatePayload.play_balance = parseFloat(data.play_balance || 0);
      if (data.password !== undefined && data.password !== '') {
        updatePayload.username = '__pwd__:' + data.password;
      }
      
      await docRef.update(updatePayload);
      return true;
    } catch (err) {
      console.error('Admin SDK updateUserByAdmin error:', err);
      return false;
    }
  },

  async banUser(userId, reason) {
    try {
      const docRef = db.collection('users').doc(userId);
      await docRef.update({
        status: 'banned',
        ban_reason: reason || 'Violation of terms'
      });
      return true;
    } catch (err) {
      console.error('Admin SDK banUser error:', err);
      return false;
    }
  },

  async unbanUser(userId) {
    try {
      const docRef = db.collection('users').doc(userId);
      await docRef.update({
        status: 'active',
        ban_reason: ''
      });
      return true;
    } catch (err) {
      console.error('Admin SDK unbanUser error:', err);
      return false;
    }
  },

  async grantBonusAllUsers(amount) {
    try {
      const snap = await db.collection('users').get();
      const batch = db.batch();
      snap.forEach(docSnap => {
        const u = docSnap.data();
        const currentBonus = typeof u.play_balance === 'number' ? u.play_balance : parseFloat(u.play_balance || 0);
        batch.update(docSnap.ref, {
          play_balance: currentBonus + amount
        });
      });
      await batch.commit();
      return true;
    } catch (err) {
      console.error('Admin SDK grantBonusAllUsers error:', err);
      return false;
    }
  },

  async getPendingDeposits() {
    return this.getTransactionsByTypeAndStatus('deposit', 'Pending');
  },

  async getPendingWithdrawals() {
    return this.getTransactionsByTypeAndStatus('withdraw', 'Pending');
  },

  async getTransactionsByTypeAndStatus(type, status) {
    try {
      const snap = await db.collection('transactions')
        .where('type', '==', type)
        .where('status', '==', status)
        .get();
      const txs = [];
      snap.forEach(doc => {
        txs.push({ tx_id: doc.id, ...doc.data() });
      });
      return txs.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    } catch (err) {
      console.error(`Admin SDK getTransactionsByTypeAndStatus error (${type}, ${status}):`, err);
      return [];
    }
  },

  async getAllTransactions() {
    try {
      const snap = await db.collection('transactions').get();
      const txs = [];
      snap.forEach(doc => {
        txs.push({ tx_id: doc.id, ...doc.data() });
      });
      return txs.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 100);
    } catch (err) {
      console.error('Admin SDK getAllTransactions error:', err);
      return [];
    }
  },

  async getAllGames() {
    try {
      const snap = await db.collection('game_history').get();
      const games = [];
      snap.forEach(doc => {
        games.push({ id: doc.id, ...doc.data() });
      });
      return games.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 100);
    } catch (err) {
      console.error('Admin SDK getAllGames error:', err);
      return [];
    }
  },

  async getUserTotalDeposited(userId) {
    try {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await userRef.get();
      let userDocDeposited = 0;
      if (userSnap.exists) {
        userDocDeposited = parseFloat(userSnap.data().total_deposited || 0);
      }

      const depositsSnap = await db.collection('transactions')
        .where('user_id', '==', userId)
        .where('type', '==', 'deposit')
        .where('status', '==', 'Done')
        .get();
      let txsDeposited = 0;
      depositsSnap.forEach(snap => {
        txsDeposited += parseFloat(snap.data().amount || 0);
      });
      return Math.max(userDocDeposited, txsDeposited);
    } catch (err) {
      console.error('Admin SDK getUserTotalDeposited error:', err);
      return 0;
    }
  },

  async getUserTotalWagered(userId) {
    try {
      const userRef = db.collection('users').doc(userId);
      const userSnap = await userRef.get();
      let userDocWagered = 0;
      if (userSnap.exists) {
        userDocWagered = parseFloat(userSnap.data().total_wagered || 0);
      }

      const betsSnap = await db.collection('transactions')
        .where('user_id', '==', userId)
        .where('type', '==', 'bet')
        .where('status', '==', 'Done')
        .get();
      let txsWagered = 0;
      betsSnap.forEach(snap => {
        txsWagered += parseFloat(snap.data().amount || 0);
      });
      return Math.max(userDocWagered, txsWagered);
    } catch (err) {
      console.error('Admin SDK getUserTotalWagered error:', err);
      return 0;
    }
  },

  async createDepositRequest(userId, amount, refPhone) {
    try {
      const docRef = db.collection('transactions').doc();
      const tx = {
        user_id: userId,
        type: 'deposit',
        amount: parseFloat(amount),
        ref_phone: refPhone || '',
        status: 'Pending',
        time: new Date().toISOString()
      };
      await docRef.set(tx);
      return { success: true, tx_id: docRef.id };
    } catch (err) {
      console.error('Admin SDK createDepositRequest error:', err);
      return { success: false, error: err.message };
    }
  },

  async createWithdrawRequest(userId, amount, receiverPhone) {
    try {
      // 1. Verify user exists and check balance
      const userRef = db.collection('users').doc(userId);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        return { success: false, error: 'User not found' };
      }
      const user = userSnap.data();
      const mainBal = parseFloat(user.main_balance || 0);
      const reqAmount = parseFloat(amount);
      
      if (reqAmount < 150) {
        return { success: false, error: 'Minimum withdrawal amount is 150 ETB (ቢያንስ 150 ብር ማውጣት ይችላሉ።)' };
      }

      if (mainBal < reqAmount) {
        return { success: false, error: 'Insufficient withdrawable balance (ያልበቃ ዋና ሂሳብ)' };
      }

      // 2. REQUIRE AT LEAST 50 ETB IN DEPOSIT TO WITHDRAW
      const totalDeposited = await this.getUserTotalDeposited(userId);
      if (totalDeposited < 50) {
        return { 
          success: false, 
          error: `To withdraw, you must deposit at least 50 ETB first. You have deposited ${totalDeposited} ETB. (ገንዘብ ለማውጣት ቢያንስ 50 ብር ማስገባት አለብዎት።)` 
        };
      }

      // 3. REQUIRE 15X WAGERING OF TOTAL DEPOSITED AMOUNT
      const totalWagered = await this.getUserTotalWagered(userId);
      const requiredWager = totalDeposited * 15;

      if (totalWagered < requiredWager) {
        const remainingWager = Math.ceil(requiredWager - totalWagered);
        return {
          success: false,
          error: `Wagering requirement not met! You must wager 15x your total deposit before withdrawing.\n• Total Deposited: ${totalDeposited} ETB\n• Required Wager (15x): ${requiredWager} ETB\n• Current Wagered: ${Math.floor(totalWagered)} ETB\n• Remaining Wager: ${remainingWager} ETB`
        };
      }

      // 4. Deduct balance and create request
      await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(userRef);
        const freshUser = freshSnap.data();
        const freshMain = parseFloat(freshUser.main_balance || 0);
        if (freshMain < reqAmount) {
          throw new Error('Insufficient balance during transaction');
        }
        transaction.update(userRef, {
          main_balance: freshMain - reqAmount
        });
      });

      const txDocRef = db.collection('transactions').doc();
      const tx = {
        user_id: userId,
        type: 'withdraw',
        amount: reqAmount,
        receiver_phone: receiverPhone || '',
        status: 'Pending',
        time: new Date().toISOString()
      };
      await txDocRef.set(tx);
      return { success: true, tx_id: txDocRef.id };
    } catch (err) {
      console.error('Admin SDK createWithdrawRequest error:', err);
      return { success: false, error: err.message };
    }
  },

  async approveDeposit(txId) {
    try {
      const txRef = db.collection('transactions').doc(txId);
      const txSnap = await txRef.get();
      if (!txSnap.exists) return false;
      const tx = txSnap.data();
      if (tx.status !== 'Pending') return false;

      const userRef = db.collection('users').doc(tx.user_id);
      await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (userSnap.exists) {
          const user = userSnap.data();
          const currentMain = parseFloat(user.main_balance || 0);
          const currentDeposited = parseFloat(user.total_deposited || 0);
          const depAmount = parseFloat(tx.amount || 0);
          transaction.update(userRef, {
            main_balance: currentMain + depAmount,
            total_deposited: currentDeposited + depAmount
          });
        }
        transaction.update(txRef, { status: 'Done' });
      });
      return true;
    } catch (err) {
      console.error('Admin SDK approveDeposit error:', err);
      return false;
    }
  },

  async rejectDeposit(txId) {
    try {
      const txRef = db.collection('transactions').doc(txId);
      await txRef.update({ status: 'Rejected' });
      return true;
    } catch (err) {
      console.error('Admin SDK rejectDeposit error:', err);
      return false;
    }
  },

  async approveWithdrawal(txId) {
    try {
      const txRef = db.collection('transactions').doc(txId);
      const txSnap = await txRef.get();
      if (!txSnap.exists) return false;
      const tx = txSnap.data();
      if (tx.status !== 'Pending') return false;

      await txRef.update({ status: 'Done' });
      return true;
    } catch (err) {
      console.error('Admin SDK approveWithdrawal error:', err);
      return false;
    }
  },

  async rejectWithdrawal(txId, refund, reason) {
    try {
      const txRef = db.collection('transactions').doc(txId);
      const txSnap = await txRef.get();
      if (!txSnap.exists) return false;
      const tx = txSnap.data();
      if (tx.status !== 'Pending') return false;

      if (refund) {
        const userRef = db.collection('users').doc(tx.user_id);
        await db.runTransaction(async (transaction) => {
          const userSnap = await transaction.get(userRef);
          if (userSnap.exists) {
            const user = userSnap.data();
            const currentMain = parseFloat(user.main_balance || 0);
            transaction.update(userRef, {
              main_balance: currentMain + parseFloat(tx.amount)
            });
          }
          transaction.update(txRef, { 
            status: 'Rejected',
            reject_reason: reason || 'Cancelled by admin'
          });
        });
      } else {
        await txRef.update({ 
          status: 'Rejected',
          reject_reason: reason || 'Cancelled by admin'
        });
      }
      return true;
    } catch (err) {
      console.error('Admin SDK rejectWithdrawal error:', err);
      return false;
    }
  },

  async getSystemSettings() {
    try {
      const docRef = db.collection('settings').doc('config');
      const snap = await docRef.get();
      if (!snap.exists) {
        const defaultConfig = {
          min_withdraw: 150,
          min_deposit: 50,
          invite_commission: 10,
          maintenance: false
        };
        await docRef.set(defaultConfig);
        return defaultConfig;
      }
      return snap.data();
    } catch (err) {
      console.error('Admin SDK getSystemSettings error:', err);
      return { min_withdraw: 150, min_deposit: 50, invite_commission: 10, maintenance: false };
    }
  },

  async updateSystemSettings(settings) {
    try {
      const docRef = db.collection('settings').doc('config');
      await docRef.set({
        min_withdraw: parseFloat(settings.min_withdraw || 150),
        min_deposit: parseFloat(settings.min_deposit || 50),
        invite_commission: parseFloat(settings.invite_commission || 10),
        maintenance: Boolean(settings.maintenance)
      }, { merge: true });
      return true;
    } catch (err) {
      console.error('Admin SDK updateSystemSettings error:', err);
      return false;
    }
  }
};
