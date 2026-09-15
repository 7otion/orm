/**
 * Derives valid `with()` arguments from a model's `relationships` literal,
 * recursing through each relation's `__relatedClass` marker.
 */

/** Recursion budget, since model graphs are cyclic; D permits D + 1 segments. */
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

/** Each relation name plus every dotted path through it; an index signature degrades to `string`. */
export type RelationPath<
	TRelations,
	D extends Depth = 5,
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
