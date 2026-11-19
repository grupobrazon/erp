import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Dados ficam valendo por 1 minuto: voltar a uma tela não baixa tudo de novo.
			// Gravações no ERP continuam atualizando na hora (invalidateQueries).
			staleTime: 60_000,
		},
	},
});