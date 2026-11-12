# Customer copy pass (lane B, 2026-11-12)

Rules applied in ar, fr and en: short sentences; warm, plain voice ("on" in French, everyday
Arabic); every error says what happened and what to do next; money reassurance where it is true
(cash on delivery: a refused or unanswered order costs nothing); no promise the product does not
keep (no "the restaurant will call you", no "pull to refresh" on the web).

Rewritten (same key in all three languages):

| Key | Before (fr) | After (fr) |
|---|---|---|
| `maps.unavailable` | La carte est indisponible pour le moment. | La carte fait une pause. Votre commande, elle, continue : réessayez dans un instant. |
| `maps.streetsMissing` (new) | – | Le plan des rues n’a pas chargé. Votre commande avance quand même. |
| `auth.methodsError` | Impossible de charger les modes de connexion. | On n’arrive pas à afficher la connexion. Vérifiez votre réseau, puis réessayez. |
| `auth.methodsUnavailable` | La connexion est temporairement indisponible. | La connexion est en pause quelques minutes. Revenez un peu plus tard. |
| `auth.unexpectedError` | Une erreur est survenue. Réessayez. | Petit souci de notre côté. Réessayez. |
| `sessions.loadError` | La liste des appareils n’a pas pu être chargée. | Vos appareils ne s’affichent pas. Réessayez dans un instant. |
| `retentionRatings.notFound` | Cette commande est introuvable. | On ne retrouve pas cette commande. Ouvrez-la depuis Mes commandes. |
| `retentionRatings.loadError` | Les avis n’ont pas pu être chargés. | Les avis ne s’affichent pas. Réessayez dans un instant. |
| `retentionOrders.reorderError` | Impossible de préparer cette commande à nouveau. | On n’a pas pu remettre cette commande dans le panier. Réessayez ou ouvrez le menu. |
| `retentionOrders.receiptError` | Le reçu n’a pas pu être chargé. | Le reçu ne s’affiche pas. Réessayez dans un instant. |
| `retentionOrders.loadError` | Vos commandes n’ont pas pu être chargées. | Vos commandes ne s’affichent pas. Vérifiez votre réseau, puis réessayez. |
| `retentionOrders.reorderOffline` | Ce restaurant ne prend pas de commandes en ligne pour le moment. | Ce restaurant ne prend pas de commandes pour l’instant. Gardez-le en favori, il revient vite. |
| `checkout.contactError` | Impossible de vérifier vos coordonnées. | On n’a pas pu vérifier votre numéro. Réessayez, ou modifiez-le. |
| `checkout.error` | Un problème est survenu. Réessayez. | Votre commande n’est pas partie. Rien n’a été payé : réessayez. |
| `accountHub.contactError` | Impossible de charger vos informations de connexion. | Vos infos de connexion ne s’affichent pas. Réessayez. |
| `tracking.status_rejected` | Refusée par le restaurant | Le restaurant n’a pas pu la prendre. Rien à payer. |
| `tracking.status_expired` | Le restaurant n’a pas répondu | Le restaurant n’a pas répondu. Rien à payer. |
| `tracking.status_delivery_failed` | Livraison impossible | Livraison impossible. Vous pouvez recommander quand vous voulez. |
| feed `empty` | Aucun restaurant à afficher pour le moment. | Pas encore de restaurant ici. Essayez une autre adresse ou revenez bientôt. |
| feed `error` | Impossible de charger les restaurants. Veuillez réessayer. | Les restaurants ne s’affichent pas. Vérifiez votre réseau, puis réessayez. |
| feed `pageError` | Impossible de charger les restaurants suivants. Veuillez réessayer. | La suite ne s’affiche pas. Réessayez. |
| feed `emptyFiltered` | Aucun restaurant ne correspond à ces filtres. | Rien avec ces filtres. Retirez-en un pour voir plus. |

Checked and kept: every other customer error already ends with a next step ("Réessayez",
"Demandez-en un nouveau", "Revenez au menu", "Vérifiez-le et confirmez à nouveau").
Restaurant, courier and admin copy is out of scope for this pass.
