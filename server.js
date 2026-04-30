import 'dotenv/config';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import OpenAI from 'openai';


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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'FitQuest API'
  });
});

// ====== GEMINI AI INITIALIZATION ======
let groqClient = null;
if (process.env.GROQ_API_KEY) {
  groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
  });
  console.log('🚀 Groq AI initialized');
} else {
  console.log('⚠️ Groq API key not found. AI Coach will use fallback mode.');
}


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

// ====== AI ENDPOINTS ======

// AI Workout Recommendations
app.get("/api/recommendations", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Analyze user's recent workouts (last 14 days)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const recentWorkouts = user.workouts.filter(w => new Date(w.date) > twoWeeksAgo);
    
    // Calculate which stats need improvement
    const stats = user.stats;
    const statsValues = [
      { name: "Strength", value: stats.strength, 
        workouts: recentWorkouts.filter(w => 
          w.name.toLowerCase().includes('squat') || 
          w.name.toLowerCase().includes('push')
        ).length 
      },
      { name: "Stamina", value: stats.stamina, 
        workouts: recentWorkouts.filter(w => 
          w.name.toLowerCase().includes('plank') || 
          w.name.toLowerCase().includes('crunch')
        ).length 
      },
      { name: "Agility", value: stats.agility, 
        workouts: recentWorkouts.filter(w => 
          w.name.toLowerCase().includes('lunge') || 
          w.name.toLowerCase().includes('jump')
        ).length 
      }
    ];
    
    // Find weakest stat
    const weakestStat = statsValues.reduce((a, b) => a.value < b.value ? a : b);
    // Find stat with least recent workouts
    const mostNeglectedStat = statsValues.reduce((a, b) => a.workouts < b.workouts ? a : b);
    
    // Workout library
    const workoutLibrary = {
      strength: [
        { name: "Squats", baseReps: 12, icon: "🦵", description: "Build powerful legs" },
        { name: "Push-ups", baseReps: 10, icon: "💪", description: "Upper body strength" },
        { name: "Lunges with Weights", baseReps: 10, icon: "🏋️", description: "Leg strength and balance" }
      ],
      stamina: [
        { name: "Plank", baseReps: 30, unit: "seconds", icon: "⏱️", description: "Core endurance" },
        { name: "Crunches", baseReps: 20, icon: "🔥", description: "Ab strength" },
        { name: "Mountain Climbers", baseReps: 20, icon: "⛰️", description: "Full body cardio" }
      ],
      agility: [
        { name: "Jumping Jacks", baseReps: 25, icon: "⚡", description: "Full body cardio" },
        { name: "High Knees", baseReps: 20, icon: "🏃", description: "Speed and coordination" },
        { name: "Lateral Lunges", baseReps: 12, icon: "🦵↔️", description: "Side-to-side movement" }
      ]
    };
    
    // Calculate reps based on user level
    const levelBonus = Math.floor(user.level / 2);
    
    // Build recommendations
    const workoutRecommendations = [];
    
    // Recommendation 1: Target weakest stat
    let focusKey = weakestStat.name.toLowerCase();
    let exercises = workoutLibrary[focusKey] || workoutLibrary.strength;
    let targetExercises = exercises.slice(0, 3).map(ex => ({
      name: ex.name,
      reps: ex.baseReps + levelBonus,
      unit: ex.unit || "reps",
      sets: 3,
      icon: ex.icon,
      description: ex.description
    }));
    
    workoutRecommendations.push({
      id: "target_weakness",
      name: `${weakestStat.name} Booster`,
      exercises: targetExercises,
      reason: `Your ${weakestStat.name} (${weakestStat.value}) is your lowest stat. Building ${weakestStat.name.toLowerCase()} will make you stronger in battles!`,
      focus: focusKey,
      estimatedXp: Math.floor(50 + (user.level * 8) + (weakestStat.value < 10 ? 20 : 0))
    });
    
    // Recommendation 2: Variety recommendation
    let varietyKey = mostNeglectedStat.name.toLowerCase();
    let varietyExercises = workoutLibrary[varietyKey] || workoutLibrary.strength;
    let varietyTarget = varietyExercises.slice(0, 3).map(ex => ({
      name: ex.name,
      reps: ex.baseReps + Math.floor(levelBonus * 0.7),
      unit: ex.unit || "reps",
      sets: 3,
      icon: ex.icon,
      description: ex.description
    }));
    
    workoutRecommendations.push({
      id: "variety",
      name: `${mostNeglectedStat.name} Focus`,
      exercises: varietyTarget,
      reason: `You haven't done many ${mostNeglectedStat.name.toLowerCase()} exercises lately. Mix it up for a well-rounded character!`,
      focus: varietyKey,
      estimatedXp: Math.floor(55 + (user.level * 7))
    });
    
    // Add motivational message
    const lastWorkout = user.workouts[user.workouts.length - 1];
    let motivationalMessage = "";
    let lastWorkoutDays = 999;
    
    if (lastWorkout) {
      lastWorkoutDays = Math.floor((new Date() - new Date(lastWorkout.date)) / (1000 * 60 * 60 * 24));
    }
    
    if (lastWorkoutDays === 0) {
      motivationalMessage = "🔥 Amazing workout today! Keep the momentum going!";
    } else if (lastWorkoutDays === 1) {
      motivationalMessage = "💪 Great consistency! Don't break your streak!";
    } else if (lastWorkoutDays <= 3) {
      motivationalMessage = "⚡ Time to get back in the gym! Your character is waiting!";
    } else {
      motivationalMessage = "🌟 Your character misses you! Time to level up!";
    }
    
    res.json({
      success: true,
      motivationalMessage,
      recommendations: workoutRecommendations,
      statsAnalysis: {
        strength: stats.strength,
        stamina: stats.stamina,
        agility: stats.agility,
        weakest: weakestStat.name,
        mostNeglected: mostNeglectedStat.name,
        workoutStreak: recentWorkouts.length,
        daysSinceLastWorkout: lastWorkoutDays
      }
    });
    
  } catch (err) {
    console.error("Recommendations error:", err);
    res.status(500).json({ success: false, message: "Error generating recommendations" });
  }
});

// ====== GROQ AI COACH ======
app.post("/api/ai-coach", authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Get user stats for context
    const recentWorkouts = user.workouts.slice(-5).map(w => w.name).join(", ");
    const lastWorkout = user.workouts[user.workouts.length - 1];
    let lastWorkoutDays = "never";
    
    if (lastWorkout) {
      lastWorkoutDays = Math.floor((new Date() - new Date(lastWorkout.date)) / (1000 * 60 * 60 * 24));
      lastWorkoutDays = lastWorkoutDays === 0 ? "today" : `${lastWorkoutDays} days ago`;
    }
    
    const xpToNextLevel = (user.level * 100) - (user.xp % 100);
    const weakestStat = user.stats.strength <= user.stats.stamina && user.stats.strength <= user.stats.agility ? "strength" :
                        user.stats.stamina <= user.stats.agility ? "stamina" : "agility";
    
    // Check if Groq is available
    if (!groqClient) {
      // Smart fallback responses
      const fallbackReply = generateFallbackResponse(message, user, weakestStat, xpToNextLevel);
      return res.json({
        success: true,
        reply: fallbackReply,
        mode: "fallback"
      });
    }
    
    // Build the system prompt
    const systemPrompt = `You are "Coach AI" for FitQuest, a fitness gamification app where users level up characters by doing real workouts.

PLAYER PROFILE:
- Hero Name: ${user.heroName}
- Level: ${user.level}
- XP to next level: ${xpToNextLevel}
- Strength: ${user.stats.strength} (affects battle damage)
- Stamina: ${user.stats.stamina} (affects endurance)
- Agility: ${user.stats.agility} (affects dodge chance)
- Health: ${user.stats.health}/100
- Gold: ${user.gold}
- Recent Workouts: ${recentWorkouts || "No workouts yet"}
- Last workout: ${lastWorkoutDays}

RESPONSE GUIDELINES:
1. Be encouraging and use their hero name (${user.heroName})
2. Keep responses under 150 words
3. Reference their stats when relevant
4. Give specific, actionable fitness advice
5. Use emojis occasionally for personality
6. If asked about their weakest stat (${weakestStat}), suggest specific exercises
7. Keep tone friendly and motivational

Respond as Coach AI:`;

    // Call Groq API
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-specdec",  // Fastest model on Groq
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,      // Creative but not random
      max_tokens: 500,       // Keep responses concise
      top_p: 0.9,
    });

    const reply = completion.choices[0].message.content;
    
    res.json({
      success: true,
      reply: reply,
      mode: "groq",
      model: "llama-3.3-70b"
    });
    
  } catch (err) {
    console.error("Groq AI Coach error:", err);
    
    // Get user for fallback
    let user = null;
    try {
      user = await User.findOne({ email: req.user?.email });
    } catch(e) {}
    
    const weakestStat = user?.stats ? 
      (user.stats.strength <= user.stats.stamina && user.stats.strength <= user.stats.agility ? "strength" :
       user.stats.stamina <= user.stats.agility ? "stamina" : "agility") : "strength";
    
    const fallbackReply = generateFallbackResponse(req.body.message, user, weakestStat, 0);
    
    res.json({
      success: true,
      reply: fallbackReply,
      mode: "fallback"
    });
  }
});

// Helper function for fallback responses
function generateFallbackResponse(message, user, weakestStat, xpToNextLevel) {
  const lowerMsg = message.toLowerCase();
  const heroName = user?.heroName || "Champion";
  
  if (lowerMsg.includes("workout") || lowerMsg.includes("exercise")) {
    if (weakestStat === "strength") {
      return `Hey ${heroName}! Your strength (${user?.stats?.strength || 5}) needs some love. Try squats (3x12), push-ups (3x10), and lunges (3x10 each leg). Do these 3x a week and you'll see your strength go up! 💪`;
    } else if (weakestStat === "stamina") {
      return `${heroName}, your stamina (${user?.stats?.stamina || 5}) is your lowest stat. Try planks (hold for 30 sec x3), mountain climbers (3x15), and jumping jacks (3x20). These will boost your endurance! 🔥`;
    } else {
      return `Let's work on your agility, ${heroName}! Try lateral lunges (3x12 each side), high knees (3x20), and burpees (3x8). These will make you faster and more mobile! ⚡`;
    }
  }
  
  if (lowerMsg.includes("battle") || lowerMsg.includes("fight")) {
    return `For battles, ${heroName}, your strength (${user?.stats?.strength || 5}) affects how much damage you deal. Do strength workouts to hit harder! Also, keep your health above 50 by buying potions in the shop. ⚔️`;
  }
  
  if (lowerMsg.includes("level") || lowerMsg.includes("xp")) {
    return `You're at Level ${user?.level || 1}, ${heroName}! ${xpToNextLevel > 0 ? `Only ${xpToNextLevel} more XP to Level ${(user?.level || 1) + 1}!` : "Ready for the next level!"} Complete workouts and win battles to earn XP. Every workout gives 10-100 XP! 🎯`;
  }
  
  if (lowerMsg.includes("water") || lowerMsg.includes("hydrate")) {
    return `Hydration is key, ${heroName}! Every cup of water gives you 2 XP. Aim for 8 cups daily to stay healthy and keep your character strong. Log your water intake on the dashboard! 💧`;
  }
  
  // Default motivational message
  const messages = [
    `I'm here to help you on your fitness journey, ${heroName}! Ask me about workouts, battles, or how to level up your character. What would you like to know? 💪`,
    `Great to see you, ${heroName}! Your ${user?.stats?.strength || 5} strength, ${user?.stats?.stamina || 5} stamina, and ${user?.stats?.agility || 5} agility are looking good. Want workout suggestions? 🔥`,
    `Ready to get stronger, ${heroName}? I can suggest exercises that target your weakest stat (${weakestStat})! Just ask me for a workout plan! ⚡`
  ];
  
  return messages[Math.floor(Math.random() * messages.length)];
}

// ====== START SERVER ======
app.listen(PORT, HOST, () => {
  console.log(`🚀 FitQuest server running at http://${HOST}:${PORT}`);
  console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${MONGODB_URI.includes('localhost') ? 'Local' : 'Cloud'}`);
  console.log(`🤖 AI Coach: ${genAI ? 'Gemini AI Active' : 'Fallback Mode'}`);
  console.log(`❤️  Health check: http://${HOST}:${PORT}/health`);
});


