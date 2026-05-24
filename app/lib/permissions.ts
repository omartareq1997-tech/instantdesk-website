export type Role = 'owner' | 'team_leader' | 'agent' | 'viewer'

export interface Permissions {
  canAddLead:      boolean
  canEditLead:     boolean
  canDeleteLead:   boolean
  canAddAppt:      boolean
  canEditAppt:     boolean
  canDeleteAppt:   boolean
  canInviteMember: boolean
  canRemoveMember: boolean
  canChangeRole:   boolean
  canUndoActions:  boolean
  /** When true the pipeline and API only expose leads assigned to the actor */
  scopedToOwnLeads: boolean
}

export function getPermissions(role: Role): Permissions {
  switch (role) {
    case 'owner':
      return {
        canAddLead: true, canEditLead: true, canDeleteLead: true,
        canAddAppt: true, canEditAppt: true, canDeleteAppt: true,
        canInviteMember: true, canRemoveMember: true, canChangeRole: true,
        canUndoActions: true, scopedToOwnLeads: false,
      }
    case 'team_leader':
      return {
        canAddLead: true, canEditLead: true, canDeleteLead: true,
        canAddAppt: true, canEditAppt: true, canDeleteAppt: true,
        canInviteMember: true, canRemoveMember: true, canChangeRole: true,
        canUndoActions: true, scopedToOwnLeads: false,
      }
    case 'agent':
      return {
        canAddLead: false, canEditLead: true, canDeleteLead: false,
        canAddAppt: true, canEditAppt: true, canDeleteAppt: false,
        canInviteMember: false, canRemoveMember: false, canChangeRole: false,
        canUndoActions: false, scopedToOwnLeads: true,
      }
    case 'viewer':
      return {
        canAddLead: false, canEditLead: false, canDeleteLead: false,
        canAddAppt: false, canEditAppt: false, canDeleteAppt: false,
        canInviteMember: false, canRemoveMember: false, canChangeRole: false,
        canUndoActions: false, scopedToOwnLeads: false,
      }
  }
}
