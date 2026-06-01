import { supabase } from '../supabaseClient'
import { pickColor } from './colors'

const TOKEN_KEY = 'tml26_session_token'
const MEMBER_KEY = 'tml26_member_id'

const uuid = () =>
  (crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    }))

export function getStoredToken() { return localStorage.getItem(TOKEN_KEY) }
export function getStoredMemberId() { return localStorage.getItem(MEMBER_KEY) }

// Restore an existing member by session token.
export async function restoreMember() {
  const token = getStoredToken()
  if (!token || !supabase) return null
  const { data } = await supabase.from('members').select('*').eq('session_token', token).maybeSingle()
  if (data) localStorage.setItem(MEMBER_KEY, data.id)
  return data ?? null
}

// Create a brand-new member with a distinct bright color.
export async function createMember(displayName) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: existing } = await supabase.from('members').select('color')
  const color = pickColor((existing ?? []).map(m => m.color))
  const token = uuid()
  const { data, error } = await supabase
    .from('members')
    .insert({ display_name: displayName.trim(), session_token: token, color })
    .select()
    .single()
  if (error) throw error
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(MEMBER_KEY, data.id)
  return data
}
