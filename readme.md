# Proxy Cloudflare pour LGM (webflow <-> wordpress)

Worker Cloudflare qui route intelligemment le trafic entre Webflow et WordPress pour le site lagrowthmachine.com.

## 📋 Informations du Worker

- **Nom**: `lgm-proxy-production`
- **Account ID**: `138a687a78cb896f0d865c9da483dad6`
- **Compatibility Date**: 2025-09-20

## 🌐 Routes actives

Le worker est actif sur les domaines suivants :
- `lagrowthmachine.com/*` (production)
- `router.lagrowthmachine.com/*` (preprod)

## 🚀 Commandes disponibles

### Installation
```bash
npm install
```

### Développement local
```bash
npm run dev
# Lance le worker en local sur http://localhost:8787
```

### Déploiement
```bash
npm run deploy
# Déploie le worker sur Cloudflare
```

### Monitoring
```bash
npm run logs
# Affiche les logs en temps réel du worker

npm run deployments
# Liste les 10 derniers déploiements

npm run versions
# Liste toutes les versions du worker
```

### Authentification
```bash
npm run cf:login
# Vérifie votre authentification Cloudflare
```

## 📁 Structure du projet

```
proxy-cf/
├── src/
│   └── index.js          # Code principal du worker
├── wrangler.toml         # Configuration Cloudflare
├── package.json          # Dépendances et scripts
├── .gitignore           # Fichiers à ignorer
├── readme.md            # Ce fichier
├── DEPLOYMENT.md        # Guide de déploiement détaillé
├── ROUTES.md            # Documentation des routes et redirections
└── toredirect.csv       # Liste des redirections à implémenter
```

## 🔧 Configuration

Le fichier `wrangler.toml` contient toute la configuration synchronisée avec Cloudflare :
- Routes configurées
- Date de compatibilité
- Account ID
- Variables d'environnement (aucune pour le moment)

## 📝 Fonctionnalités du Worker

- **Routage intelligent** : Dirige le trafic vers Webflow ou WordPress selon les patterns d'URL
- **Redirections Academy** : Gère automatiquement les anciennes URLs academy (301)
- **Configuration maintenable** : Listes simples de routes faciles à modifier
- **Gestion SEO** : Réécriture des métadonnées (canonical, hreflang, Open Graph, etc.)
- **Trailing slash** : Ajout automatique des trailing slashes pour la cohérence SEO
- **Sitemaps agrégés** : Combine les sitemaps de Webflow et WordPress
- **Cache optimisé** : Cache intelligent pour les assets statiques uniquement
- **Gestion des cookies** : Proxy transparent des cookies WordPress
- **Intégration Weglot** : Préserve la configuration Weglot pour les traductions multilingues

## 🔐 Sécurité

- Aucun secret ou variable sensible n'est stocké dans le code
- Les credentials WordPress sont gérés côté serveur
- Headers de sécurité configurés (X-Robots-Tag, Referrer-Policy, etc.)

## 📊 Monitoring

- **Workers Logs** : Activés sur Cloudflare
- **Métriques** : Disponibles dans le dashboard Cloudflare
- **Tail logs** : `npm run logs` pour voir les logs en temps réel

## 🔄 Workflow de développement

1. **Modifier le code** : Éditez `src/index.js`
2. **Tester localement** : `npm run dev`
3. **Déployer** : `npm run deploy`
4. **Vérifier** : `npm run deployments` pour voir le déploiement

## ⚠️ Notes importantes

- Le worker est déjà actif en production
- Toute modification déployée sera immédiatement en ligne
- Testez toujours localement avant de déployer
- Les déploiements sont versionnés et peuvent être rollback depuis le dashboard Cloudflare

## 🆘 Support

Pour toute question ou problème :
- Vérifier les logs : `npm run logs`
- Consulter l'historique : `npm run deployments`
- Dashboard Cloudflare : https://dash.cloudflare.com/