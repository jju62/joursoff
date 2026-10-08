<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.
https://ai.studio/apps/9f9146b0-5433-4d00-9cee-a6d0f4764ab5

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase Duo sharing

To enable calendar sharing, apply
[`supabase/migrations/20261006153000_user_relationships.sql`](./supabase/migrations/20261006153000_user_relationships.sql)
to the Supabase project (for example, through the Supabase SQL Editor or the Supabase CLI).
It creates the `user_relationships` table, participant-only RLS, and authenticated RPC
functions for creating/redeeming invitations, reading the linked calendar, and unlinking.

The shared-calendar RPC returns only leave dates, leave types, and half-day periods; it
does not return leave labels, account email addresses, or CP/RTT balances.

## Plannings de groupe

Pour activer les groupes partagés, appliquez
[`supabase/migrations/20261007100000_calendar_groups.sql`](./supabase/migrations/20261007100000_calendar_groups.sql)
au projet Supabase. Les comptes Pro peuvent créer des groupes, inviter des membres
avec un code réutilisable et filtrer les membres visibles dans le calendrier. Les
calendriers de groupe restent en lecture seule et ne transmettent ni libellés, ni
adresses email, ni soldes de congés.

## Publicités

Pour activer les bannières Google AdSense en production, renseignez
`VITE_ADSENSE_CLIENT` (identifiant éditeur `ca-pub-…`) et `VITE_ADSENSE_SLOT`
(identifiant de l’emplacement) dans l’environnement de build. Sans ces deux valeurs,
aucun script publicitaire n’est chargé. En développement, une bannière de test et un
basculeur Gratuit/Pro sont disponibles dans les paramètres du profil.

Le compte gratuit reçoit les prévisions jusqu’à J+3 et une idée générique d’escapade.
Le compte Pro reçoit les prévisions jusqu’à J+7, trois suggestions filtrables et les
normales climatiques mensuelles calculées à partir des archives Open-Meteo (1991–2020).
Les thèmes Indigo et Émeraude sont gratuits ; OLED, Pastel et Saisonnier sont réservés
à Pro.
La consultation du calendrier Duo est gratuite ; son actualisation et l’édition de la
vue partagée sont réservées à Pro.

## Statut Pro

Appliquez [`supabase/migrations/20261007110000_profiles_is_pro.sql`](./supabase/migrations/20261007110000_profiles_is_pro.sql)
dans le SQL Editor Supabase. Le script crée `public.profiles` si elle n’existe pas,
ajoute `is_pro` (`boolean`, `false` par défaut), active les politiques RLS de lecture
et d’écriture par utilisateur, et initialise un profil à chaque inscription ainsi que
pour les comptes déjà existants. Un trigger refuse toute tentative venant d’un JWT
utilisateur de définir ou modifier `is_pro`; les changements de statut doivent être
effectués par un traitement serveur privilégié. Le contexte React lit cette valeur à
la connexion. En développement, le basculeur Gratuit/Pro enregistre sa valeur en
base via la RPC `set_my_pro_test_status`. Les clients ne peuvent pas écrire
directement `profiles.is_pro`; le basculeur n’est pas disponible en production.

La migration [`supabase/migrations/20261007120000_grant_pro_test_access.sql`](./supabase/migrations/20261007120000_grant_pro_test_access.sql)
ajoute la RPC `grant_pro_test_access` et une allowlist privée
`public.pro_test_access_admins`. Après application, un administrateur doit ajouter
l’UUID du compte autorisé depuis le SQL Editor, par exemple :

```sql
insert into public.pro_test_access_admins (user_id) values ('UUID-DU-COMPTE');
```

Le bouton de développement du profil appelle la RPC, rafraîchit la session puis
active et enregistre `is_pro`. Les comptes absents de cette allowlist ne peuvent pas
s’autoriser eux-mêmes. La RPC ajoute `allow_pro_test_toggle` aux `app_metadata` du
compte autorisé, puis le client renouvelle sa session avant d’écrire le statut Pro.

Ne validez pas un abonnement payant à partir de l’état local du navigateur. La
validation des droits Pro nécessite une source de confiance côté serveur.