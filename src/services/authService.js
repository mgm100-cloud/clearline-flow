import { supabase } from '../supabaseClient'

export const AuthService = {
  // Get current user session
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      return user
    } catch (error) {
      console.error('Error getting current user:', error)
      return null
    }
  },

  // Get current session
  async getCurrentSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error
      return session
    } catch (error) {
      console.error('Error getting current session:', error)
      return null
    }
  },

  // Sign up new user
  async signUp(email, password, userData = {}) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: userData.role || 'readonly',
            full_name: userData.fullName || '',
            division: userData.division || '',
            analyst_code: userData.analystCode || ''
          }
        }
      })
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error signing up:', error)
      throw error
    }
  },

  // Sign in user
  async signIn(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error signing in:', error)
      throw error
    }
  },

  // Sign out user
  async signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      return true
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  },

  // Update user profile
  async updateUserProfile(updates) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: updates
      })
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error updating user profile:', error)
      throw error
    }
  },

  // Add division to existing user metadata
  async addDivisionToUser(division) {
    try {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        throw new Error('No current user found');
      }

      const currentMetadata = currentUser.user_metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        division: division
      };

      console.log('📝 Adding division to user metadata:', { division, updatedMetadata });

      const { data, error } = await supabase.auth.updateUser({
        data: updatedMetadata
      });

      if (error) throw error;
      
      console.log('✅ Successfully added division to user metadata');
      return data;
    } catch (error) {
      console.error('Error adding division to user:', error);
      throw error;
    }
  },

  // Sync profile data from database to user metadata
  async syncProfileToMetadata(profileData) {
    try {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        throw new Error('No current user found');
      }

      const currentMetadata = currentUser.user_metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...profileData
      };

      console.log('🔄 Syncing profile data to user metadata:', { profileData, updatedMetadata });

      const { data, error } = await supabase.auth.updateUser({
        data: updatedMetadata
      });

      if (error) throw error;
      
      console.log('✅ Successfully synced profile data to user metadata');
      return data;
    } catch (error) {
      console.error('Error syncing profile data to user metadata:', error);
      throw error;
    }
  },

  // Get user role from metadata
  getUserRole(user) {
    if (!user || !user.user_metadata) return 'readonly'
    return user.user_metadata.role || 'readonly'
  },

  // Get user analyst code from metadata
  getUserAnalystCode(user) {
    if (!user || !user.user_metadata) return ''
    return user.user_metadata.analyst_code || ''
  },

  // Get user division from database (always fresh) with metadata fallback
  async getUserDivision(user, forceRefresh = false) {
    if (!user) {
      console.warn('⚠️ No user found for division lookup');
      return '';
    }
    
    console.log('🔍 Getting user division:', {
      user_metadata: user.user_metadata,
      division: user.user_metadata?.division,
      forceRefresh,
      allKeys: user.user_metadata ? Object.keys(user.user_metadata) : []
    });
    
    // TEMPORARY FIX: Set your specific user to Super division immediately
    if (user.email === 'mmajzner@clearlinecap.com') {
      console.log('🔧 TEMPORARY FIX: Setting Marc to Super division (skipping all database operations)');
      console.log('✅ Returning Super division immediately');
      return 'Super';
    }
    
    // Always check user_profiles table first for fresh data (unless it's a fallback scenario)
    try {
      console.log('🔍 Checking user_profiles table for fresh division data...');
      
      // Add a timeout to prevent hanging
      const queryPromise = supabase
        .from('user_profiles')
        .select('division, analyst_code, role')
        .eq('id', user.id)
        .single();
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 5000)
      );
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      
      if (error) {
        console.warn('⚠️ Error fetching user profile:', error);
        console.warn('This might be because the division column hasnt been added yet.');
      } else if (data) {
        console.log('✅ Found user profile data:', data);
        
        // If we have division data from database, use it and sync to metadata
        if (data.division) {
          console.log('✅ Found division in user_profiles:', data.division);
          
          // Sync all profile data to user metadata for consistency
          console.log('🔄 Syncing profile data to user metadata...');
          await this.syncProfileToMetadata({
            division: data.division,
            analyst_code: data.analyst_code,
            role: data.role
          });
          
          return data.division;
        } else {
          console.log('📝 No division found in user_profiles table, data:', data);
        }
      }
    } catch (error) {
      console.error('❌ Error checking user_profiles for division:', error);
      console.error('This is likely because the division column hasnt been added to user_profiles table yet or query timed out.');
    }
    
    console.log('🔄 Falling back to metadata and default logic...');
    
    // Fallback to user_metadata if database query failed
    const metadataDivision = user.user_metadata?.division;
    if (metadataDivision) {
      console.log('✅ Found division in user metadata (fallback):', metadataDivision);
      return metadataDivision;
    }
    
    console.warn('⚠️ No division found in user metadata or user_profiles. This might be an existing user who signed up before division field was added.');
    
    // For existing users, default to Investment division if they have an analyst code, otherwise return empty
    const analystCode = user.user_metadata?.analyst_code;
    if (analystCode) {
      console.log('📝 Defaulting to Investment division for user with analyst code:', analystCode);
      return 'Investment';
    }
    
    // Also check if user has admin/readwrite role - likely Investment users
    const role = user.user_metadata?.role;
    if (role === 'admin' || role === 'readwrite') {
      console.log('📝 Defaulting to Investment division for admin/readwrite user');
      return 'Investment';
    }
    
    console.log('📝 No analyst code or admin role found, returning empty division');
    return '';
  },

  // Get user full name from metadata
  getUserFullName(user) {
    if (!user || !user.user_metadata) return user?.email || 'User'
    return user.user_metadata.full_name || user.email || 'User'
  },

  // Check if user has readwrite access
  hasReadWriteAccess(user) {
    const role = this.getUserRole(user)
    return role === 'readwrite' || role === 'admin'
  },

  // Reset password
  async resetPassword(email) {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error resetting password:', error)
      throw error
    }
  },

  // Refresh user data from database on login
  async refreshUserData(user, skipMetadataUpdate = false) {
    console.log('🔄 Refreshing user data from database...');
    console.log('🔍 User ID:', user.id);
    
    // DEEP DIAGNOSTIC: Test each step with very short timeouts
    
    // Test 1: Basic supabase connection with simple query
    try {
      console.log('🧪 TEST 1: Basic Supabase connection test...');
      const startTime1 = performance.now();
      
      const basicTestPromise = supabase.from('tickers').select('count').limit(1);
      const timeout1 = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Basic connection timeout')), 2000)
      );
      
      await Promise.race([basicTestPromise, timeout1]);
      console.log(`✅ TEST 1 PASSED: Basic connection works (${(performance.now() - startTime1).toFixed(2)}ms)`);
    } catch (error) {
      console.error('❌ TEST 1 FAILED: Basic connection failed:', error.message);
      return user;
    }
    
    // Test 2: Database function with very short timeout
    try {
      console.log('🧪 TEST 2: Database function test...');
      const startTime2 = performance.now();
      
      const functionPromise = supabase.rpc('get_user_profile_data', { user_uuid: user.id });
      const timeout2 = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Function timeout')), 2000)
      );
      
      const { data: functionData, error: functionError } = await Promise.race([functionPromise, timeout2]);
      
      if (!functionError && functionData) {
        console.log(`✅ TEST 2 PASSED: Function works (${(performance.now() - startTime2).toFixed(2)}ms):`, functionData);
        
        const refreshedUser = {
          ...user,
          user_metadata: {
            ...user.user_metadata,
            division: functionData.division || user.user_metadata?.division,
            analyst_code: functionData.analyst_code || user.user_metadata?.analyst_code,
            role: functionData.role || user.user_metadata?.role,
            full_name: functionData.full_name || user.user_metadata?.full_name
          }
        };
        
        console.log('✅ User data refreshed via function:', refreshedUser.user_metadata);
        return refreshedUser;
      } else {
        console.log('❌ TEST 2 FAILED: Function error:', functionError?.message);
      }
    } catch (error) {
      console.error('❌ TEST 2 FAILED: Function timeout or error:', error.message);
    }
    
    // Test 3: Simple count query on user_profiles table
    try {
      console.log('🧪 TEST 3: user_profiles table access test...');
      const startTime3 = performance.now();
      
      const countPromise = supabase.from('user_profiles').select('count');
      const timeout3 = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Count query timeout')), 2000)
      );
      
      await Promise.race([countPromise, timeout3]);
      console.log(`✅ TEST 3 PASSED: user_profiles accessible (${(performance.now() - startTime3).toFixed(2)}ms)`);
    } catch (error) {
      console.error('❌ TEST 3 FAILED: user_profiles access failed:', error.message);
    }
    
    // Test 4: Direct user query with very short timeout
    try {
      console.log('🧪 TEST 4: Direct user query test...');
      const startTime4 = performance.now();
      
      const queryPromise = supabase
        .from('user_profiles')
        .select('division, analyst_code, role, full_name')
        .eq('id', user.id)
        .single();
      
      const timeout4 = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Direct query timeout')), 2000)
      );
      
      const { data: profileData, error } = await Promise.race([queryPromise, timeout4]);
      
      if (!error && profileData) {
        console.log(`✅ TEST 4 PASSED: Direct query works (${(performance.now() - startTime4).toFixed(2)}ms):`, profileData);
        
        const refreshedUser = {
          ...user,
          user_metadata: {
            ...user.user_metadata,
            division: profileData.division || user.user_metadata?.division,
            analyst_code: profileData.analyst_code || user.user_metadata?.analyst_code,
            role: profileData.role || user.user_metadata?.role,
            full_name: profileData.full_name || user.user_metadata?.full_name
          }
        };
        
        console.log('✅ User data refreshed via direct query:', refreshedUser.user_metadata);
        return refreshedUser;
      } else {
        console.log('❌ TEST 4 FAILED: Direct query error:', error?.message);
      }
    } catch (error) {
      console.error('❌ TEST 4 FAILED: Direct query timeout:', error.message);
    }
    
    console.log('⚠️ ALL TESTS FAILED: Using existing metadata');
    console.log('🔍 This suggests a fundamental database connectivity or performance issue');
    return user;
  },

  // Listen to auth state changes
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  }
} 