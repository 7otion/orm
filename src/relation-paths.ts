/**
 * Derives valid `with()` arguments from a model's `relationships` literal.
 *
 * The literal supplies relation names; each value's phantom `__relatedClass`
 * marker supplies the related class, letting these types recurse into it.
 */

/**
 * Recursion budget. Model graphs are cyclic, so an uncapped walk never
 * terminates. Four levels covers realistic graphs.
 */
type Decrement = [never, 0, 1, 2, 3, 4, 5];
type Depth = 0 | 1 | 2 | 3 | 4 | 5;

type RelatedClassOf<TRelation> = TRelation extends {
	readonly __relatedClass?: infer C;
}
	? C
	: unknown;

type RelationsOf<TClass> = TClass extends { relationships: infer R }
	? R
	: Record<never, never>;

/**
 * Each relation name, plus every dotted path reachable through it.
 *
 * A registry with an index signature rather than known keys degrades to
 * `string`, so models without a typed literal keep working.
 */
export type RelationPath<
	TRelations,
	D extends Depth = 4,
> = string extends keyof TRelations
	? string
	: [D] extends [never]
		? never
		: {
				[K in keyof TRelations & string]:
					| K
					| `${K}.${RelationPath<
							RelationsOf<RelatedClassOf<TRelations[K]>>,
							Decrement[D] & Depth
					  >}`;
			}[keyof TRelations & string];

export type AnyRelations = Record<string, any>;
