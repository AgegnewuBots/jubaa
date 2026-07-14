const { initializeApp } = require('firebase/app');
const { getAuth } = require('firebase/auth');
const { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch, 
  runTransaction 
} = require('firebase/firestore');
const firebaseConfig = require('./firebase-applet-config.json');

// Initialize Firebase Web SDK
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

function handleFirestoreError(error, operationType, path) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo = {
    error: errMessage,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };

  try {
    if (auth && auth.currentUser) {
      errInfo.authInfo = {
        userId: auth.currentUser.uid,
        email: auth.currentUser.email,
        emailVerified: auth.currentUser.emailVerified,
        isAnonymous: auth.currentUser.isAnonymous,
        tenantId: auth.currentUser.tenantId,
        providerInfo: auth.currentUser.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      };
    }
  } catch (e) {
    // Ignore error getting auth info
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function checkAndHandleError(error, operationType, path) {
  if (error && (error.code === 'permission-denied' || (error.message && error.message.toLowerCase().includes('permission')))) {
    handleFirestoreError(error, operationType, path);
  }
}

// Normalizes user fields to support camelCase and snake_case properties seamlessly
function normalizeUser(dbUser) {
  if (!dbUser) return null;
  return {
    ...dbUser,
    userId: dbUser.user_id,
    firstName: dbUser.first_name,
    mainBalance: typeof dbUser.main_balance === 'number' ? dbUser.main_balance : parseFloat(dbUser.main_balance || 0),
    playBalance: typeof dbUser.play_balance === 'number' ? dbUser.play_balance : parseFloat(dbUser.play_balance || 0),
    gamesPlayed: dbUser.games_played || 0,
    gamesWon: dbUser.games_won || 0,
    totalWon: dbUser.total_won || 0,
    invited: dbUser.invited || 0,
    isVip: dbUser.is_vip || false,
    currentStreak: dbUser.current_streak || 0,
    highestStreak: dbUser.highest_streak || 0,
    mainBalanceValue: typeof dbUser.main_balance === 'number' ? dbUser.main_balance : parseFloat(dbUser.main_balance || 0),
    playBalanceValue: typeof dbUser.play_balance === 'number' ? dbUser.play_balance : parseFloat(dbUser.play_balance || 0)
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
      highest_streak: 0
    };
  }
  return memoryDb.users[userId];
}

module.exports = {
  db,
  auth,
  async getUser(userId) {
    try {
      const userDocRef = doc(db, 'users', userId);
      const docSnap = await getDoc(userDocRef);
      if (!docSnap.exists()) {
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
          highest_streak: 0
        };
        await setDoc(userDocRef, newUser);
        return normalizeUser(newUser);
      }
      return normalizeUser(docSnap.data());
    } catch (err) {
      console.error('Firebase getUser error:', err);
      checkAndHandleError(err, OperationType.GET, 'users/' + userId);
      return normalizeUser(getMemoryUser(userId));
    }
  },

  async registerWebUser(userId, password, name) {
    try {
      const userDocRef = doc(db, 'users', userId);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
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
        highest_streak: 0
      };
      await setDoc(userDocRef, newUser);
      return normalizeUser(newUser);
    } catch (err) {
      console.error('Firebase registerWebUser error:', err);
      checkAndHandleError(err, OperationType.WRITE, 'users/' + userId);
      return null;
    }
  },

  async setUserPassword(userId, password) {
    try {
      const userDocRef = doc(db, 'users', userId);
      await setDoc(userDocRef, {
        username: '__pwd__:' + password
      }, { merge: true });
    } catch (err) {
      console.error('Firebase setUserPassword error:', err);
      checkAndHandleError(err, OperationType.WRITE, 'users/' + userId);
    }
  },

  async loginWebUser(userId, password) {
    try {
      const userDocRef = doc(db, 'users', userId);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const user = docSnap.data();
        if (user.username === '__pwd__:' + password) {
          return normalizeUser(user);
        }
      }
      return null;
    } catch (err) {
      console.error('Firebase loginWebUser error:', err);
      checkAndHandleError(err, OperationType.GET, 'users/' + userId);
      return null;
    }
  },

  async updateUserName(userId, firstName, username) {
    try {
      const userDocRef = doc(db, 'users', userId);
      await setDoc(userDocRef, {
        first_name: firstName,
        username: username
      }, { merge: true });
    } catch (err) {
      console.error('Firebase updateUserName error:', err);
      checkAndHandleError(err, OperationType.WRITE, 'users/' + userId);
    }
  },

  async deductBet(userId, amount) {
    try {
      const userDocRef = doc(db, 'users', userId);
      const result = await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(userDocRef);
        if (!docSnap.exists()) return null;
        
        const user = docSnap.data();
        let play = parseFloat(user.play_balance || 0);
        let main = parseFloat(user.main_balance || 0);
        
        if (play + main < amount) return null;
        
        if (play >= amount) {
          play -= amount;
        } else {
          main -= (amount - play);
          play = 0;
        }
        
        transaction.update(userDocRef, {
          play_balance: play,
          main_balance: main
        });
        
        return { play, main, user };
      });
      
      if (!result) return null;
      
      const transactionsCollection = collection(db, 'transactions');
      const txDocRef = doc(transactionsCollection);
      await setDoc(txDocRef, {
        user_id: userId,
        type: 'bet',
        amount: amount,
        status: 'Done',
        time: new Date().toISOString()
      });
      
      return normalizeUser({
        ...result.user,
        play_balance: result.play,
        main_balance: result.main
      });
    } catch (err) {
      console.error('Firebase deductBet error:', err);
      checkAndHandleError(err, OperationType.WRITE, 'users/' + userId);
      return null;
    }
  },

  async addWin(userId, amount, gameId) {
    try {
      const userDocRef = doc(db, 'users', userId);
      const result = await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(userDocRef);
        if (!docSnap.exists()) return null;
        
        const user = docSnap.data();
        const newMain = parseFloat(user.main_balance || 0) + amount;
        const newGamesWon = parseInt(user.games_won || 0) + 1;
        const newTotalWon = parseFloat(user.total_won || 0) + amount;
        
        transaction.update(userDocRef, {
          main_balance: newMain,
          games_won: newGamesWon,
          total_won: newTotalWon
        });
        
        return { ...user, main_balance: newMain, games_won: newGamesWon, total_won: newTotalWon };
      });
      
      if (!result) return null;
      
      const transactionsCollection = collection(db, 'transactions');
      const txDocRef = doc(transactionsCollection);
      await setDoc(txDocRef, {
        user_id: userId,
        type: 'bingo_win',
        amount: amount,
        status: 'Done',
        time: new Date().toISOString()
      });
      
      const q = query(
        collection(db, 'game_history'),
        where('user_id', '==', userId),
        where('game_id', '==', gameId)
      );
      const querySnap = await getDocs(q);
        
      const batch = writeBatch(db);
      querySnap.forEach(snap => {
        batch.update(snap.ref, { result: '+' + amount + ' Br' });
      });
      await batch.commit();
      
      return normalizeUser(result);
    } catch (err) {
      console.error('Firebase addWin error:', err);
      checkAndHandleError(err, OperationType.WRITE, 'users/' + userId);
      return null;
    }
  },

  async recordGamePlayed(userId, gameId, cardsCount, stake) {
    try {
      const userDocRef = doc(db, 'users', userId);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const user = docSnap.data();
        await updateDoc(userDocRef, {
          games_played: parseInt(user.games_played || 0) + 1
        });
      }
      
      const historyCollection = collection(db, 'game_history');
      const histDocRef = doc(historyCollection);
      await setDoc(histDocRef, {
        user_id: userId,
        game_id: gameId,
        entry: cardsCount * stake,
        status: 'Completed',
        result: '-',
        time: new Date().toISOString()
      });
    } catch (err) {
      console.error('Firebase recordGamePlayed error:', err);
      checkAndHandleError(err, OperationType.WRITE, 'game_history');
    }
  },

  async getGameHistory(userId) {
    try {
      const q = query(
        collection(db, 'game_history'),
        where('user_id', '==', userId)
      );
      const querySnap = await getDocs(q);
        
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
      console.error('Firebase getGameHistory error:', err);
      checkAndHandleError(err, OperationType.LIST, 'game_history');
      return [];
    }
  },

  async getTransactions(userId) {
    try {
      const q = query(
        collection(db, 'transactions'),
        where('user_id', '==', userId)
      );
      const querySnap = await getDocs(q);
        
      const transactions = [];
      querySnap.forEach(snap => {
        transactions.push(snap.data());
      });
      
      transactions.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
      
      return transactions.slice(0, 20).map(d => ({
        type: d.type,
        amount: d.amount,
        status: d.status,
        time: d.time
      }));
    } catch (err) {
      console.error('Firebase getTransactions error:', err);
      checkAndHandleError(err, OperationType.LIST, 'transactions');
      return [];
    }
  },

  async getProfileStats(userId) {
    try {
      const userDocRef = doc(db, 'users', userId);
      const docSnap = await getDoc(userDocRef);
      if (!docSnap.exists()) return null;
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
      console.error('Firebase getProfileStats error:', err);
      checkAndHandleError(err, OperationType.GET, 'users/' + userId);
      return null;
    }
  },

  async updateUserStreak(userId, won) {
    try {
      const userDocRef = doc(db, 'users', userId);
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(userDocRef);
        if (!docSnap.exists()) return;
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
        transaction.update(userDocRef, {
          current_streak: current,
          highest_streak: highest
        });
      });
    } catch (err) {
      console.error('Firebase updateUserStreak error:', err);
      checkAndHandleError(err, OperationType.WRITE, 'users/' + userId);
    }
  },

  async getTopWinners(period, category) {
    try {
      let orderBy = 'total_won';
      if (category === 'deposit') orderBy = 'main_balance';
      if (category === 'invite') orderBy = 'invited';
      if (category === 'games') orderBy = 'games_played';
      
      const querySnap = await getDocs(collection(db, 'users'));
      const users = [];
      querySnap.forEach(snap => {
        users.push(snap.data());
      });
      
      users.sort((a, b) => (b[orderBy] || 0) - (a[orderBy] || 0));
      
      return users.slice(0, 30).map(u => {
        let displayName = u.first_name;
        if (!displayName && u.username) {
          if (u.username.startsWith('__pwd__:')) {
            displayName = 'Web User ' + (u.user_id ? u.user_id.slice(-6) : '');
          } else {
            displayName = u.username;
          }
        }
        if (!displayName) displayName = 'Anonymous';
        return {
          name: displayName,
          value: u[orderBy] || 0
        };
      });
    } catch (err) {
      console.error('Firebase getTopWinners error:', err);
      checkAndHandleError(err, OperationType.LIST, 'users');
      return [];
    }
  },

  async getMyRank(userId, period, category) {
    try {
      let orderBy = 'total_won';
      if (category === 'deposit') orderBy = 'main_balance';
      if (category === 'invite') orderBy = 'invited';
      if (category === 'games') orderBy = 'games_played';
      
      const querySnap = await getDocs(collection(db, 'users'));
      const users = [];
      querySnap.forEach(snap => {
        users.push(snap.data());
      });
      
      users.sort((a, b) => (b[orderBy] || 0) - (a[orderBy] || 0));
      
      const rankIdx = users.findIndex(u => u.user_id === userId);
      if (rankIdx !== -1) {
        return {
          rank: rankIdx + 1,
          value: users[rankIdx][orderBy] || 0
        };
      }
      return null;
    } catch (err) {
      console.error('Firebase getMyRank error:', err);
      checkAndHandleError(err, OperationType.LIST, 'users');
      return null;
    }
  }
};
