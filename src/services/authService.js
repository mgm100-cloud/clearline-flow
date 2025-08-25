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

  // Get user division from metadata
  getUserDivision(user) {
    if (!user || !user.user_metadata) return ''
    return user.user_metadata.division || ''
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