import 'dotenv/config';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ====== PORT CONFIGURATION ======
const PORT = parseInt(process.env.PORT) || 4000;
const HOST = '0.0.0.0';

// ====== EXPRESS APP SETUP ======
const app = express(); // ONLY ONCE!

// ====== CORS CONFIGURATION ======
app.use(cors({
  origin: ['http://localhost:4000', 'http://localhost:3000', 'https://*.up.railway.app'],
  credentials: true,
}));
app.use(express.json());

// ====== HEALTH CHECK (MUST BE EARLY!) ======
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'FitQuest API'
  });
});

// ====== STATIC FILE SERVING ======
app.use('/assets', express.static(join(__dirname, 'assets')));
app.use(express.static(__dirname));

// ====== ROUTES FOR HTML PAGES ======
// Main landing page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'fitquest.html'));
});

// Login page
app.get('/login', (req, res) => {
  res.sendFile(join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(join(__dirname, 'signup.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(join(__dirname, 'dashboard.html'));
});

app.get('/battle', (req, res) => {
  res.sendFile(join(__dirname, 'battle.html'));
});

app.get('/workout', (req, res) => {
  res.sendFile(join(__dirname, 'workout.html'));
});

// ====== DATABASE CONNECTION ======
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitquest';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  // In production, we might want to continue without DB
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️ Continuing without database connection...');
  }
});

// ====== GAME SCHEMAS ======
const questSchema = new mongoose.Schema({
  title: String,
  description: String,
  type: { type: String, enum: ['workout', 'hydration', 'boss'] },
  requirement: Number,
  reward: { xp: Number, gold: Number },
  completed: { type: Boolean, default: false }
});

const battleSchema = new mongoose.Schema({
  enemyName: String,
  enemyHP: Number,
  enemyMaxHP: Number,
  enemyDamage: Number,
  enemyDescription: String,
  userHP: Number,
  userMaxHP: Number,
  completed: { type: Boolean, default: false },
  victory: { type: Boolean, default: false },
  fled: { type: Boolean, default: false },
  date: { type: Date, default: Date.now }
});

// ====== USER SCHEMA ======
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  heroName: String,
  stats: { 
    strength: { type: Number, default: 5 }, 
    stamina: { type: Number, default: 5 }, 
    agility: { type: Number, default: 5 },
    health: { type: Number, default: 100 }
  },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  gold: { type: Number, default: 100 },
  waterIntake: [{ 
    date: { type: String, default: () => new Date().toISOString().split('T')[0] }, 
    cups: Number 
  }],
  workouts: [{ 
    name: String, 
    reps: Number, 
    weight: Number, 
    xp: Number,
    date: { type: Date, default: Date.now }
  }],
  activeQuests: [questSchema],
  completedQuests: [questSchema],
  battles: [battleSchema],
  inventory: [{ item: String, quantity: Number }]
});

const User = mongoose.model("User", userSchema);

// Secret key for signing tokens
const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_development';

// ====== GAME DATA ======
const QUESTS = [
  {
    title: "First Steps",
    description: "Complete 10 squats to strengthen your legs",
    type: "workout",
    requirement: 10,
    reward: { xp: 50, gold: 25 }
  },
  {
    title: "Hydration Hero", 
    description: "Drink 4 cups of water today",
    type: "hydration",
    requirement: 4,
    reward: { xp: 30, gold: 15 }
  },
  {
    title: "Push-up Power",
    description: "Complete 15 push-ups for upper body strength",
    type: "workout", 
    requirement: 15,
    reward: { xp: 75, gold: 35 }
  }
];

const ENEMIES = [
  { 
    name: "The Lazy Dragon", 
    hp: 50, 
    damage: 8,
    reward: { xp: 100, gold: 50 },
    description: "A sleepy dragon that hates exercise!"
  },
  { 
    name: "Procrastination Golem", 
    hp: 80, 
    damage: 12,
    reward: { xp: 150, gold: 75 },
    description: "A creature made of excuses and delays"
  },
  { 
    name: "Motivation Slayer", 
    hp: 120, 
    damage: 15,
    reward: { xp: 200, gold: 100 },
    description: "Drains your will to workout"
  },
  { 
    name: "Couch Potato Titan", 
    hp: 150, 
    damage: 18,
    reward: { xp: 250, gold: 125 },
    description: "A titan made of laziness and snacks"
  }
];

// ====== MIDDLEWARE ======
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// ====== API ENDPOINTS ======

// Register
app.post("/register", async (req, res) => {
  try {
    const { email, password, heroName } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashed,
      heroName,
      stats: { strength: 5, stamina: 5, agility: 5, health: 100 },
      level: 1,
      xp: 0,
      gold: 100,
    });

    await user.save();
    res.json({ success: true, message: "User registered" });
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ success: false, message: "Email already exists" });
    } else {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).json({ success: false, message: "User not found" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(400).json({ success: false, message: "Incorrect password" });
  }

  const token = jwt.sign({ email: user.email, userId: user._id }, JWT_SECRET, { expiresIn: "2h" });

  res.json({
    success: true,
    message: "Login successful",
    token,
    heroName: user.heroName,
    stats: user.stats,
    level: user.level,
    gold: user.gold,
  });
});

// Profile
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const userData = { ...user._doc };
    delete userData.password;
    
    res.json(userData);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Log water
app.post("/log-water", authenticateToken, async (req, res) => {
  try {
    const { cups } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    const user = await User.findOne({ email: req.user.email });
    
    const todayEntry = user.waterIntake.find(entry => entry.date === today);
    
    if (todayEntry) {
      todayEntry.cups += cups;
    } else {
      user.waterIntake.push({ date: today, cups });
    }
    
    user.xp += Math.round(cups * 2);
    
    await user.save();
    res.json({ success: true, message: "Water logged successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

function calculateWorkoutXP(name, reps, weight, sets = 1) {
  const baseXP = Math.floor((reps * weight * sets) / 10) + 10;
  
  let bonus = 0;
  if (name.toLowerCase().includes('squat')) bonus = 5;
  if (name.toLowerCase().includes('push')) bonus = 8;
  if (name.toLowerCase().includes('plank')) bonus = 3;
  
  return baseXP + bonus;
}

// Log workout
app.post("/log-workout", authenticateToken, async (req, res) => {
  try {
    const { name, reps, weight, sets = 1 } = req.body;
    const user = await User.findOne({ email: req.user.email });
    
    const xp = calculateWorkoutXP(name, reps, weight, sets);
    
    user.workouts.push({
      name,
      reps: reps * sets,
      weight,
      xp,
      date: new Date()
    });
    
    user.xp += xp;
    
    const newLevel = Math.floor(user.xp / 100) + 1;
    let leveledUp = false;
    
    if (newLevel > user.level) {
      user.level = newLevel;
      leveledUp = true;
      
      if (name.toLowerCase().includes('squat') || name.toLowerCase().includes('push')) {
        user.stats.strength += 2;
      } else if (name.toLowerCase().includes('plank') || name.toLowerCase().includes('crunch')) {
        user.stats.stamina += 2;
      } else {
        user.stats.agility += 2;
      }
    }
    
    await user.save();
    res.json({ 
      success: true, 
      message: "Workout logged successfully",
      leveledUp: leveledUp,
      newLevel: leveledUp ? newLevel : null,
      xpEarned: xp
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Today's water
app.get("/today-water", authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const user = await User.findOne({ email: req.user.email });
    
    const todayEntry = user.waterIntake.find(entry => entry.date === today);
    const cups = todayEntry ? todayEntry.cups : 0;
    
    res.json({ cups, goal: 8 });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Quests
app.get("/quests", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    
    if (user.activeQuests.length === 0) {
      user.activeQuests = QUESTS.map(quest => ({...quest}));
      await user.save();
    }
    
    res.json(user.activeQuests);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Quest progress
app.get("/quests/progress", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    const today = new Date().toISOString().split('T')[0];
    
    const progress = user.activeQuests.map(quest => {
      let completed = 0;
      
      if (quest.type === 'workout') {
        completed = user.workouts.reduce((total, workout) => 
          total + (workout.name.toLowerCase().includes('squat') ? workout.reps : 0), 0);
      } else if (quest.type === 'hydration') {
        const todayWater = user.waterIntake.find(entry => entry.date === today);
        completed = todayWater ? todayWater.cups : 0;
      }
      
      return {
        ...quest._doc,
        completed,
        progress: Math.min(completed / quest.requirement, 1)
      };
    });
    
    res.json(progress);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Battle start
app.post("/battle/start", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }
    
    if (user.stats.health <= 10) {
      return res.status(400).json({ 
        success: false, 
        message: "Your health is too low! Buy health potions first." 
      });
    }
    
    const randomIndex = Math.floor(Math.random() * ENEMIES.length);
    const enemy = ENEMIES[randomIndex];
    
    const battle = {
      enemyName: enemy.name,
      enemyHP: enemy.hp,
      enemyMaxHP: enemy.hp,
      enemyDamage: enemy.damage,
      enemyDescription: enemy.description,
      userHP: user.stats.health,
      userMaxHP: user.stats.health,
      completed: false,
      victory: false,
      fled: false
    };
    
    user.battles.push(battle);
    await user.save();
    
    res.json({ 
      success: true,
      battle, 
      userStats: user.stats,
      message: `A wild ${enemy.name} appears! ${enemy.description}`
    });
  } catch (err) {
    console.error("Battle start error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Server error starting battle",
      error: err.message 
    });
  }
});

// Battle attack
app.post("/battle/attack", authenticateToken, async (req, res) => {
  try {
    const { name, reps, weight } = req.body;
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    const activeBattle = user.battles
      .filter(battle => !battle.completed)
      .pop();
    
    if (!activeBattle) {
      return res.status(400).json({ 
        success: false, 
        message: "No active battle found" 
      });
    }
    
    const baseDamage = Math.floor((reps * (weight || 1)) / 10) + user.stats.strength;
    activeBattle.enemyHP -= baseDamage;
    
    const enemyDamage = activeBattle.enemyDamage || 10;
    user.stats.health -= enemyDamage;
    activeBattle.userHP = user.stats.health;
    
    if (user.stats.health < 0) user.stats.health = 0;
    if (activeBattle.enemyHP < 0) activeBattle.enemyHP = 0;
    
    let battleResult = null;
    
    if (activeBattle.enemyHP <= 0) {
      activeBattle.completed = true;
      activeBattle.victory = true;
      
      const enemy = ENEMIES.find(e => e.name === activeBattle.enemyName) || ENEMIES[0];
      const reward = enemy.reward || { xp: 50, gold: 25 };
      
      user.xp += reward.xp;
      user.gold += reward.gold;
      
      const newLevel = Math.floor(user.xp / 100) + 1;
      if (newLevel > user.level) {
        user.level = newLevel;
        user.stats.strength += 2;
        user.stats.stamina += 2;
        user.stats.agility += 1;
        user.stats.health += 20;
      }
      
      battleResult = {
        victory: true,
        reward: reward,
        message: `You defeated ${activeBattle.enemyName}! +${reward.xp} XP, +${reward.gold} Gold`
      };
      
    } else if (activeBattle.userHP <= 0) {
      activeBattle.completed = true;
      activeBattle.victory = false;
      battleResult = {
        victory: false,
        message: "You were defeated! Your health has been reduced. Buy health potions to recover."
      };
    }
    
    await user.save();
    
    res.json({
      success: true,
      damageDealt: baseDamage,
      damageTaken: enemyDamage,
      battle: activeBattle,
      userHealth: user.stats.health,
      battleResult: battleResult,
      message: activeBattle.completed ? 
        (battleResult ? battleResult.message : "Battle ended") :
        `You dealt ${baseDamage} damage! ${activeBattle.enemyName} hit you for ${enemyDamage} damage!`
    });
    
  } catch (err) {
    console.error("Battle attack error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Server error in battle attack",
      error: err.message 
    });
  }
});

// Buy health
app.post("/shop/buy-health", authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findOne({ email: req.user.email });
    const cost = amount * 10;
    
    if (user.gold < cost) {
      return res.status(400).json({ 
        success: false, 
        message: `Not enough gold! Need ${cost} gold.` 
      });
    }
    
    user.gold -= cost;
    user.stats.health += amount;
    
    await user.save();
    
    res.json({
      success: true,
      healthGained: amount,
      goldSpent: cost,
      newHealth: user.stats.health,
      newGold: user.gold,
      message: `Restored ${amount} health for ${cost} gold!`
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Flee battle
app.post("/battle/flee", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    const activeBattle = user.battles[user.battles.length - 1];
    
    if (!activeBattle || activeBattle.completed) {
      return res.status(400).json({ message: "No active battle" });
    }
    
    activeBattle.completed = true;
    activeBattle.fled = true;
    
    user.stats.health -= 5;
    
    await user.save();
    
    res.json({
      success: true,
      healthLost: 5,
      newHealth: user.stats.health,
      message: "You fled from battle! Lost 5 health from the escape."
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Recent activities
app.get("/recent-activities", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const recentWorkouts = user.workouts
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(workout => ({
        type: "workout",
        title: workout.name,
        details: `${workout.reps} reps${workout.weight ? ` @ ${workout.weight}kg` : ''}`,
        xp: workout.xp,
        date: workout.date,
        icon: "🏋️"
      }));
    
    const recentBattles = user.battles
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(battle => ({
        type: "battle",
        title: battle.enemyName || "Enemy",
        details: battle.victory ? "Victory!" : battle.fled ? "Fled" : "Defeated",
        xp: battle.victory ? 50 : 10,
        date: battle.date,
        icon: "⚔️",
        result: battle.victory ? "victory" : "defeat"
      }));
    
    const recentWaterLogs = user.waterIntake
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3)
      .map(water => ({
        type: "water",
        title: "Water Intake",
        details: `${water.cups} cups`,
        xp: Math.round(water.cups * 2),
        date: water.date,
        icon: "💧"
      }));
    
    const allActivities = [...recentWorkouts, ...recentBattles, ...recentWaterLogs]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
    
    res.json({ activities: allActivities });
  } catch (err) {
    console.error("Error getting activities:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Level progress
app.get("/level-progress", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const currentXP = user.xp;
    const currentLevel = user.level;
    const xpForNextLevel = currentLevel * 100;
    const xpForCurrentLevel = (currentLevel - 1) * 100;
    const xpProgress = currentXP - xpForCurrentLevel;
    const progressPercent = (xpProgress / 100) * 100;
    
    res.json({
      level: currentLevel,
      xp: currentXP,
      xpForNextLevel: xpForNextLevel,
      xpProgress: xpProgress,
      progressPercent: Math.min(progressPercent, 100),
      nextLevel: currentLevel + 1
    });
  } catch (err) {
    console.error("Error getting level progress:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ====== START SERVER ======
app.listen(PORT, HOST, () => {
  console.log(`🚀 FitQuest server running at http://${HOST}:${PORT}`);
  console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${MONGODB_URI.includes('localhost') ? 'Local' : 'Cloud'}`);
  console.log(`❤️  Health check: http://${HOST}:${PORT}/health`);
});


