import { menuGroups } from "@/lib/menuConfig";
import { useAuth } from "@/lib/AuthContext";

export const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "vendedor", label: "Vendedor" },
  { value: "supervisor", label: "Supervisor" },
  { value: "logistica", label: "Logística" },
  { value: "producao", label: "Produção" },
  { value: "pos_vendas", label: "Pós-Vendas" },
  { value: "financeiro", label: "Financeiro" },
  { value: "contas_receber", label: "Contas a Receber" },
  { value: "tecnico", label: "Técnico" },
];

export const roleLabels = Object.fromEntries(ROLES.map(r => [r.value, r.label]));

export const roleBadgeColors = {
  admin: "bg-rose-100 text-rose-700",
  vendedor: "bg-emerald-100 text-emerald-700",
  supervisor: "bg-blue-100 text-blue-700",
  logistica: "bg-cyan-100 text-cyan-700",
  producao: "bg-orange-100 text-orange-700",
  pos_vendas: "bg-violet-100 text-violet-700",
  financeiro: "bg-amber-100 text-amber-700",
  contas_receber: "bg-yellow-100 text-yellow-700",
  tecnico: "bg-teal-100 text-teal-700",
};

// Menu access per role: { "GroupName": true | ["Item1", "Item2"] }
// Role not listed here = full access (admin)
export const menuAccessByRole = {
  vendedor: {
    "Início": true,
    "Vendas": ["Clientes", "Vendas", "Venda de Balcão", "Tabela de Preços", "Metas de Distribuição", "Vendas Canceladas", "Faturamento", "Notas Fiscais"],
    "Estoque": ["Produtos"],
    "Manutenção": ["Painel de Manutenção", "Ordens de Serviço", "Agenda de Rotas", "Rotas de Técnico"],
    "Estratégia & Oportunidade": ["Distribuição de Clientes", "Relatório de Distribuição"],
  },
  logistica: {
    "Início": true,
    "Vendas": true,
    "Estoque": true,
    "Manutenção": true,
  },
  supervisor: {
    "Início": true,
    "Vendas": true,
    "Financeiro": ["Confirmações de Venda"],
    "Estoque": true,
    "Manutenção": true,
    "Estratégia & Oportunidade": ["Dashboard de Oportunidades", "Distribuição de Clientes", "Relatório de Distribuição", "Relatório de Telefones", "Curva ABC de Vendas", "Campanhas 3C Plus"],
    "Cadastros": ["Programas e Promoções", "Cadastros de Produtos", "Cadastros Financeiros", "Cadastros do Sistema"],
    "Sistema": ["Usuários", "Importação"],
  },
  contas_receber: {
    "Início": true,
    "Vendas": ["Clientes", "Vendas", "Venda de Balcão", "Metas de Distribuição", "Vendas Canceladas", "Remessas", "Faturamento", "Notas Fiscais"],
    "Financeiro": ["Confirmações de Venda", "Contas a Receber", "Contas a Pagar", "Conciliação Bancária", "Lançar Custos", "Precificação", "Tabela de Preços"],
    "Cadastros": ["Cadastros Financeiros"],
  },
  financeiro: {
    "Início": true,
    "Vendas": true,
    "Financeiro": true,
    "Cadastros": true,
  },
  producao: {
    "Início": true,
    "Manutenção": ["Produção", "Romaneio de Expedição", "Dashboard de Produção"],
  },
  tecnico: {
    "Início": true,
    "Manutenção": ["Rotas de Técnico", "Modo Técnico"],
  },
};

// Permission flags per role
// Omitted flags inherit from defaultPerms (admin behavior)
export const rolePermissions = {
  vendedor: {
    canDeleteClient: false,
    canInactiveClient: false,
    canBill: false,
    canTransmitNFe: false,
    canCancelNFe: false,
    canManageOS: false,
    canManageRoutes: false,
    canDeleteRoute: true,
    canAddStopsToRoute: false,
    canAssignZone: false,
    canEditProducts: false,
    canDeleteSale: false,
    canOverrideScheduleBlock: false,
  },
  logistica: {
    canAddStopsToRoute: false,
    canEditProduction: false,
    canBill: false,
    canTransmitNFe: false,
    canCancelNFe: false,
  },
  supervisor: {
    canBill: false,
    canTransmitNFe: false,
    canCancelNFe: false,
    canEditProduction: false,
    canConfirmSale: false,
    canDeleteRoute: false,
    canAddStopsToRoute: false,
  },
  contas_receber: {
    canDeleteClient: false,
    canDeleteSale: false,
    canManageOS: false,
    canManageRoutes: false,
    canDeleteRoute: false,
    canAddStopsToRoute: false,
    canAssignZone: false,
    canManageMaintenance: false,
    canEditProduction: false,
    canEditProducts: false,
  },
  financeiro: {
    canDeleteClient: false,
    canDeleteSale: false,
    canManageOS: false,
    canManageRoutes: false,
    canDeleteRoute: false,
    canAddStopsToRoute: false,
    canAssignZone: false,
    canManageMaintenance: false,
    canEditProduction: false,
    canEditProducts: false,
  },
  producao: {
    canDeleteClient: false,
    canDeleteSale: false,
    canManageOS: false,
    canManageRoutes: false,
    canDeleteRoute: false,
    canAddStopsToRoute: false,
    canAssignZone: false,
    canManageMaintenance: false,
    canBill: false,
    canTransmitNFe: false,
    canCancelNFe: false,
    canEditProducts: false,
    canConfirmSale: false,
  },
  tecnico: {
    canDeleteClient: false,
    canDeleteSale: false,
    canManageOS: false,
    canManageRoutes: false,
    canDeleteRoute: false,
    canAddStopsToRoute: false,
    canAssignZone: false,
    canManageMaintenance: false,
    canBill: false,
    canTransmitNFe: false,
    canCancelNFe: false,
    canEditProducts: false,
    canConfirmSale: false,
    canCreateSale: false,
    canEditProduction: false,
    canInactiveClient: false,
    phonesAddOnly: true,
  },
  pos_vendas: {
    canAssignZone: false,
    canDeleteRoute: false,
    canAddStopsToRoute: false,
  },
};

const defaultPerms = {
  canDeleteClient: true,
  canInactiveClient: true,
  phonesAddOnly: false,
  commercialInfoReadOnly: true, // System-wide: auto-updated by sales
  canBill: true,
  canTransmitNFe: true,
  canCancelNFe: true,
  canManageOS: true,
  canManageRoutes: true,
  canDeleteRoute: true,
  canAddStopsToRoute: true,
  canAssignZone: true,
  canEditProducts: true,
  canCreateSale: true,
  canDeleteSale: true,
  canManageMaintenance: true,
  canEditProduction: true,
  canConfirmSale: true,
  canOverrideScheduleBlock: true,
  };

export function getMenuForRoles(roles, extraMenuAccess) {
  const validRoles = roles.filter(Boolean);
  if (validRoles.length === 0) return menuGroups;
  if (validRoles.includes("admin")) return menuGroups;
  const mergedAccess = {};
  for (const role of validRoles) {
    const access = menuAccessByRole[role];
    if (!access) continue;
    for (const [group, items] of Object.entries(access)) {
      if (items === true || mergedAccess[group] === true) {
        mergedAccess[group] = true;
      } else if (Array.isArray(mergedAccess[group])) {
        mergedAccess[group] = [...new Set([...mergedAccess[group], ...items])];
      } else {
        mergedAccess[group] = [...items];
      }
    }
  }
  // Liberação adicional por usuário (não afeta outros usuários do mesmo perfil)
  if (extraMenuAccess && typeof extraMenuAccess === "object") {
    for (const [group, items] of Object.entries(extraMenuAccess)) {
      if (items === true || mergedAccess[group] === true) {
        mergedAccess[group] = true;
      } else if (Array.isArray(items)) {
        if (Array.isArray(mergedAccess[group])) {
          mergedAccess[group] = [...new Set([...mergedAccess[group], ...items])];
        } else {
          mergedAccess[group] = [...items];
        }
      }
    }
  }
  return menuGroups
    .filter(g => mergedAccess[g.label] !== undefined || g.label === "Alertas")
    .map(g => {
      if (g.single) return g;
      const allowed = mergedAccess[g.label];
      if (allowed === true) return g;
      return { ...g, children: g.children.filter(c => allowed.includes(c.label)) };
    })
    .filter(g => g.single || (g.children && g.children.length > 0));
}

export function getMenuForRole(role, extraMenuAccess) {
  return getMenuForRoles([role], extraMenuAccess);
}

export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role;
  const additionalRoles = user?.additional_roles || [];
  const allRoles = [role, ...additionalRoles].filter(Boolean);
  const isAdmin = allRoles.length === 0 || allRoles.includes("admin");
  let mergedPerms = {};
  for (const r of allRoles) {
    const perms = rolePermissions[r];
    if (!perms) continue;
    for (const [key, val] of Object.entries(perms)) {
      if (!(key in mergedPerms)) {
        mergedPerms[key] = val;
      } else {
        mergedPerms[key] = mergedPerms[key] || val;
      }
    }
  }
  // Permissões individuais concedidas direto ao usuário (User.extra_permissions) — não alteram o perfil
  const extraPermissions = user?.extra_permissions || [];
  const perms = { ...defaultPerms, ...mergedPerms };
  if (extraPermissions.includes("apagar_rota")) perms.canDeleteRoute = true;
  if (extraPermissions.includes("adicionar_atendimentos_rota")) perms.canAddStopsToRoute = true;

  return {
    role,
    additionalRoles,
    allRoles,
    isAdmin,
    canDeleteOS: perms.canManageOS && canUserDeleteOS(user),
    // Estorno de pedido (Vendas → voltar para Orçamento): admin/supervisor ou liberação individual
    canRevertSale: isAdmin || allRoles.includes("supervisor") || extraPermissions.includes("estornar_pedido"),
    ...perms,
  };
}

// Exceção individual: estes usuários não podem apagar OS, mesmo com perfil que permite
// gerenciar OS (admin / logística). Basta o nome ou o e-mail conter o termo.
const NO_DELETE_OS_USERS = ["otavio", "eliel", "adriana", "isadora"];

export function canUserDeleteOS(user) {
  if (!user) return false;
  const raw = [user.full_name, user.email].filter(Boolean).join(" ");
  const normalized = String(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return !NO_DELETE_OS_USERS.some((token) => new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(normalized));
}

const supervisorInvitableRoles = ["vendedor", "logistica", "pos_vendas", "tecnico"];

export function getInvitableRoles(isAdmin) {
  if (isAdmin) return ROLES;
  return ROLES.filter(r => supervisorInvitableRoles.includes(r.value));
}