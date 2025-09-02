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

  // Get user division from metadata or database
  async getUserDivision(user) {
    if (!user) {
      console.warn('⚠️ No user found for division lookup');
      return '';
    }
    
    console.log('🔍 Debug user metadata for division:', {
      user_metadata: user.user_metadata,
      division: user.user_metadata?.division,
      allKeys: user.user_metadata ? Object.keys(user.user_metadata) : []
    });
    
    // Check user_metadata first
    const metadataDivision = user.user_metadata?.division;
    if (metadataDivision) {
      console.log('✅ Found division in user metadata:', metadataDivision);
      return metadataDivision;
    }
    
    // If not in metadata, check user_profiles table
    try {
      console.log('🔍 Division not in metadata, checking user_profiles table...');
      const { data, error } = await supabase
        .from('user_profiles')
        .select('division')
        .eq('id', user.id)
        .single();
      
      if (error) {
        console.warn('⚠️ Error fetching user profile:', error);
      } else if (data && data.division) {
        console.log('✅ Found division in user_profiles:', data.division);
        
        // Sync division to user metadata for future use
        console.log('🔄 Syncing division to user metadata...');
        await this.addDivisionToUser(data.division);
        
        return data.division;
      }
    } catch (error) {
      console.error('❌ Error checking user_profiles for division:', error);
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

  // Listen to auth state changes
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  }
} 