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

  // Get user division, with option to skip DB fetch (useful during initial auth)
  async getUserDivision(user, skipDb = false) {
    if (!user) {
      console.warn('⚠️ No user found for division lookup');
      return '';
    }
    
    console.log('🔍 Getting user division:', {
      user_metadata: user.user_metadata,
      division: user.user_metadata?.division,
      skipDb,
      allKeys: user.user_metadata ? Object.keys(user.user_metadata) : []
    });
    
    // Use metadata/database only; remove hardcoded overrides so refreshed data is honored
    
    // First prefer metadata
    const metadataDivision = user.user_metadata?.division;
    if (metadataDivision) {
      console.log('✅ Found division in user metadata:', metadataDivision);
      return metadataDivision;
    }

    // If instructed to skip DB (e.g., during initial auth), do not block or default
    if (skipDb) {
      console.log('⏭️ Skipping DB lookup for division during initial auth pass');
      return '';
    }

    // Otherwise, check user_profiles table for fresh data
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
    
    // Fallbacks when DB query failed and metadata missing
    
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
    
    // SOLUTION: Defer database query to avoid authentication timing conflicts
    console.log('⏰ Deferring database refresh to avoid auth timing conflicts');
    
    // Small delay to let authentication settle
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      console.log('🔍 Attempting database refresh after auth settlement...');
      
      const { data: functionData, error: functionError } = await supabase
        .rpc('get_user_profile_data', { user_uuid: user.id });
      
      if (!functionError && functionData) {
        // Supabase RPC may return a single row or an array of rows; normalize to object
        const row = Array.isArray(functionData) ? functionData[0] : functionData;
        console.log('✅ Database function successful after delay:', row);
        
        const refreshedUser = {
          ...user,
          user_metadata: {
            ...user.user_metadata,
            division: row?.division || user.user_metadata?.division,
            analyst_code: row?.analyst_code || user.user_metadata?.analyst_code,
            role: row?.role || user.user_metadata?.role,
            full_name: row?.full_name || user.user_metadata?.full_name
          }
        };
        
        console.log('✅ User data refreshed successfully:', refreshedUser.user_metadata);
        return refreshedUser;
      } else {
        console.log('⚠️ Database function failed, using existing metadata:', functionError?.message);
        return user;
      }
    } catch (error) {
      console.error('❌ Database refresh failed after delay:', error.message);
      return user;
    }
    
  },

  // Listen to auth state changes
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  },

  // Check if an analyst code already exists in the database
  async checkAnalystCodeExists(analystCode) {
    if (!analystCode) return false;
    
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('analyst_code')
        .eq('analyst_code', analystCode)
        .limit(1);
      
      if (error) {
        console.error('Error checking analyst code:', error);
        return false; // On error, allow signup and let DB constraint catch it
      }
      
      return data && data.length > 0;
    } catch (error) {
      console.error('Error checking analyst code:', error);
      return false;
    }
  }
} 