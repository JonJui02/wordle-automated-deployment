// supabase-service.js - Database connection and API calls
// FREE cloud database using Supabase (replaces localStorage with persistent cloud storage)

// ⚠️ SETUP INSTRUCTIONS:
// 1. Go to https://supabase.com and create a free account
// 2. Create a new project (takes ~2 minutes)
// 3. Go to SQL Editor and run the schema from BACKEND_FREE_SUPABASE.md
// 4. Go to Project Settings → API and copy your values below
// 5. Replace YOUR_PROJECT and YOUR_ANON_KEY with your actual values

// Initialize Supabase client
// ⚠️ HARDCODED CREDENTIALS - WORKS IN PRODUCTION
const SUPABASE_URL = "https://mfxvemoeszpotpsunkch.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1meHZlbW9lc3pwb3Rwc3Vua2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE0NTg0NzAsImV4cCI6MjA0NzAzNDQ3MH0.jSOpHGYbZnQeQzFGJlDl30S3FJt81djB4HK4jUUHiTQ";

const isSupabaseConfigured = true;

let supabase = null;

// Initialize Supabase client only if configured
if (isSupabaseConfigured && typeof window !== "undefined" && window.supabase) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("✅ Supabase initialized - Cloud database active");
} else {
  console.log("ℹ️ Supabase not configured - Using localStorage only");
  console.log("💡 To enable cloud sync: Copy supabase-config.local.example.js to supabase-config.local.js and add your credentials");
}

// Get or create anonymous user
async function getOrCreateUser() {
  // If Supabase not configured, return null (will use localStorage)
  if (!supabase) {
    return null;
  }

  let userId = localStorage.getItem("WORDLE_USER_ID");

  if (!userId) {
    try {
      // Create anonymous user
      const userIdentifier = `anon_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const { data, error } = await supabase
        .from("users")
        .insert([{ user_identifier: userIdentifier, is_anonymous: true }])
        .select()
        .single();

      if (error) {
        console.error("Error creating user:", error);
        return null;
      }

      userId = data.id;
      localStorage.setItem("WORDLE_USER_ID", userId);

      // Create initial stats record
      const { error: statsError } = await supabase
        .from("player_stats")
        .insert([{ user_id: userId }]);

      if (statsError) {
        console.error("Error creating stats:", statsError);
      }

      console.log("✅ New anonymous user created:", userIdentifier);
    } catch (error) {
      console.error("Error in getOrCreateUser:", error);
      return null;
    }
  }

  return userId;
}

// Load stats from Supabase
async function loadStatsFromSupabase() {
  // If Supabase not configured, return null (will use localStorage)
  if (!supabase) {
    return null;
  }

  try {
    const userId = await getOrCreateUser();
    if (!userId) return null;

    const { data, error } = await supabase
      .from("player_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Error loading stats:", error);
      return null;
    }

    console.log("✅ Stats loaded from Supabase");

    return {
      gamesPlayed: data.games_played,
      gamesWon: data.games_won,
      currentStreak: data.current_streak,
      maxStreak: data.max_streak,
    };
  } catch (error) {
    console.error("Error in loadStatsFromSupabase:", error);
    return null;
  }
}

// Save stats to Supabase
async function saveStatsToSupabase(
  stats,
  wordPlayed = "",
  isWon = false,
  guesses = 0
) {
  // If Supabase not configured, return false (will use localStorage only)
  if (!supabase) {
    return false;
  }

  try {
    const userId = await getOrCreateUser();
    if (!userId) return false;

    // Calculate win rate
    const winRate =
      stats.gamesPlayed > 0
        ? ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(2)
        : 0;

    // Update stats
    const { error: statsError } = await supabase
      .from("player_stats")
      .update({
        games_played: stats.gamesPlayed,
        games_won: stats.gamesWon,
        current_streak: stats.currentStreak,
        max_streak: stats.maxStreak,
        win_rate: winRate,
        last_played: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (statsError) {
      console.error("Error saving stats:", statsError);
      return false;
    }

    // Log game history (only if word was played)
    if (wordPlayed) {
      const { error: historyError } = await supabase
        .from("game_history")
        .insert([
          {
            user_id: userId,
            word_played: wordPlayed,
            guesses_made: guesses,
            is_won: isWon,
          },
        ]);

      if (historyError) {
        console.error("Error saving history:", historyError);
      }
    }

    console.log("✅ Stats saved to Supabase");
    return true;
  } catch (error) {
    console.error("Error in saveStatsToSupabase:", error);
    return false;
  }
}

// Get leaderboard (top 100 players by max streak)
async function getLeaderboard(limit = 100) {
  // If Supabase not configured, return empty array
  if (!supabase) {
    console.log("ℹ️ Leaderboard not available - Supabase not configured");
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("player_stats")
      .select("*, users(user_identifier)")
      .order("max_streak", { ascending: false })
      .order("win_rate", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching leaderboard:", error);
      return [];
    }

    console.log(`✅ Leaderboard loaded: ${data.length} players`);
    return data;
  } catch (error) {
    console.error("Error in getLeaderboard:", error);
    return [];
  }
}

// Get user's rank
async function getUserRank() {
  // If Supabase not configured, return null
  if (!supabase) {
    return null;
  }

  try {
    const userId = await getOrCreateUser();
    if (!userId) return null;

    // Get user's stats
    const { data: userStats } = await supabase
      .from("player_stats")
      .select("max_streak")
      .eq("user_id", userId)
      .single();

    if (!userStats) return null;

    // Count how many users have better max_streak
    const { count } = await supabase
      .from("player_stats")
      .select("*", { count: "exact", head: true })
      .gt("max_streak", userStats.max_streak);

    const rank = count + 1; // Rank is count + 1
    console.log(`✅ Your rank: #${rank}`);
    return rank;
  } catch (error) {
    console.error("Error in getUserRank:", error);
    return null;
  }
}

// Check if Supabase is available and working
async function checkSupabaseConnection() {
  if (!supabase) {
    return false;
  }

  try {
    const { error } = await supabase.from("users").select("id").limit(1);

    if (error) {
      console.error("❌ Supabase connection failed:", error);
      return false;
    }

    console.log("✅ Supabase connection successful");
    return true;
  } catch (error) {
    console.error("❌ Supabase connection error:", error);
    return false;
  }
}

// Check if current user has a profile
async function checkUserProfile() {
  if (!supabase) {
    return false;
  }

  try {
    const userId = localStorage.getItem("WORDLE_USER_ID");
    if (!userId) return false;

    const { data, error } = await supabase
      .from("users")
      .select("is_claimed, display_name")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.is_claimed === true && data.display_name !== null;
  } catch (error) {
    console.error("Error checking user profile:", error);
    return false;
  }
}

// Get full user profile data
async function getUserProfile() {
  if (!supabase) {
    return null;
  }

  try {
    const userId = localStorage.getItem("WORDLE_USER_ID");
    if (!userId) return null;

    const { data, error } = await supabase
      .from("users")
      .select("display_name, email, avatar_url, is_claimed")
      .eq("id", userId)
      .single();

    if (error || !data || !data.is_claimed) {
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
}

// Delete user profile (return to anonymous)
async function deleteUserProfile() {
  if (!supabase) {
    console.error("Supabase not configured");
    return false;
  }

  try {
    const userId = localStorage.getItem("WORDLE_USER_ID");
    if (!userId) {
      console.error("No user ID found");
      return false;
    }

    // Reset user to anonymous state
    const { error } = await supabase
      .from("users")
      .update({
        display_name: null,
        email: null,
        avatar_url: null,
        username: null,
        auth_provider: "anonymous",
        is_claimed: false,
        claimed_at: null,
      })
      .eq("id", userId);

    if (error) {
      console.error("❌ Error deleting profile:", error);
      return false;
    }

    console.log("✅ Profile deleted - returned to anonymous mode");
    return true;
  } catch (error) {
    console.error("Error in deleteUserProfile:", error);
    return false;
  }
}

// Create user profile and migrate stats
async function createUserProfile(displayName, email, avatarUrl = null) {
  if (!supabase) {
    console.error("Supabase not configured");
    return false;
  }

  try {
    const anonymousUserId = localStorage.getItem("WORDLE_USER_ID");
    if (!anonymousUserId) {
      console.error("No user ID found");
      return false;
    }

    // Get current localStorage stats
    const localStats = JSON.parse(localStorage.getItem("wordleStats")) || {
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
    };

    // Get current RDS stats from anonymous user
    const { data: anonymousStats } = await supabase
      .from("player_stats")
      .select("*")
      .eq("user_id", anonymousUserId)
      .single();

    // Merge stats - take maximum values
    const mergedStats = {
      games_played: Math.max(
        localStats.gamesPlayed,
        anonymousStats?.games_played || 0
      ),
      games_won: Math.max(localStats.gamesWon, anonymousStats?.games_won || 0),
      current_streak: Math.max(
        localStats.currentStreak,
        anonymousStats?.current_streak || 0
      ),
      max_streak: Math.max(
        localStats.maxStreak,
        anonymousStats?.max_streak || 0
      ),
    };

    const winRate =
      mergedStats.games_played > 0
        ? ((mergedStats.games_won / mergedStats.games_played) * 100).toFixed(2)
        : 0;

    // Generate username from email
    const username =
      email.split("@")[0] + "_" + Date.now().toString().slice(-4);

    // First, verify the user exists
    console.log("🔍 Checking if user exists:", anonymousUserId);
    const { data: existingUser, error: checkError } = await supabase
      .from("users")
      .select("*")
      .eq("id", anonymousUserId)
      .single();

    console.log("👤 Found user:", existingUser);

    if (checkError || !existingUser) {
      console.error("❌ User not found in database:", checkError);
      return false;
    }

    // Update users table with profile info
    console.log("🔄 Attempting to update user:", anonymousUserId);
    console.log("📝 Update data:", {
      username,
      displayName,
      email,
      avatarUrl,
    });

    const { data: updateResult, error: userError } = await supabase
      .from("users")
      .update({
        username: username,
        display_name: displayName,
        email: email,
        avatar_url: avatarUrl,
        auth_provider: "email",
        is_claimed: true,
        claimed_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
      })
      .eq("id", anonymousUserId)
      .select();

    if (userError) {
      console.error("❌ Error updating user profile:", userError);
      console.error("Error details:", userError.message, userError.details);
      return false;
    }

    console.log("✅ User updated:", updateResult);

    // Update player_stats with merged stats
    console.log("🔄 Updating player stats...");
    const { data: statsResult, error: statsError } = await supabase
      .from("player_stats")
      .update({
        ...mergedStats,
        win_rate: winRate,
      })
      .eq("user_id", anonymousUserId)
      .select();

    if (statsError) {
      console.error("❌ Error updating stats:", statsError);
      console.error("Error details:", statsError.message);
      return false;
    }

    console.log("✅ Stats updated:", statsResult);
    console.log("✅ Profile created successfully!");
    console.log("📊 Stats migrated:", mergedStats);
    return true;
  } catch (error) {
    console.error("Error creating profile:", error);
    return false;
  }
}

// Get leaderboard with sorting
async function getLeaderboardWithSort(limit = 100, sortBy = "streak") {
  if (!supabase) {
    console.log("ℹ️ Leaderboard not available - Supabase not configured");
    return [];
  }

  try {
    let query = supabase
      .from("player_stats")
      .select(
        "*, users!inner(user_identifier, display_name, avatar_url, is_claimed, email)"
      )
      .eq("users.is_claimed", true)
      .not("users.display_name", "is", null);

    // Sort based on parameter
    if (sortBy === "streak") {
      query = query.order("max_streak", { ascending: false });
    } else if (sortBy === "winrate") {
      query = query.order("win_rate", { ascending: false });
    }

    query = query.order("games_played", { ascending: false }).limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching leaderboard:", error);
      console.error("Error details:", error.message, error.details);
      return [];
    }

    console.log(`✅ Leaderboard loaded: ${data.length} players`);
    return data;
  } catch (error) {
    console.error("Error in getLeaderboardWithSort:", error);
    return [];
  }
}
