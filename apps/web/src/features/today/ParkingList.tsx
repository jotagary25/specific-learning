import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ParkItForm } from "./ParkIt.tsx";
import styles from "./Today.module.css";
import { deleteParking, fetchParking, todayKeys, updateParking } from "./today.api.ts";

/** The parking list: curiosity jumps written down during sessions, explored later. */
export function ParkingList() {
  const queryClient = useQueryClient();
  const parking = useQuery({ queryKey: todayKeys.parking, queryFn: fetchParking });
  const refresh = () => queryClient.invalidateQueries({ queryKey: todayKeys.all });
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => updateParking(id, { done }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: deleteParking, onSuccess: refresh });

  return (
    <section className={styles.card} aria-labelledby="parking-title">
      <h2 id="parking-title" className={styles.subheading}>
        Parking list
      </h2>
      <p className={styles.muted}>Ideas that pulled you away. Explore them when you have time.</p>
      <ParkItForm label="Add" />
      {parking.isError && <p className={styles.error}>{parking.error.message}</p>}
      {parking.data && parking.data.items.length === 0 && (
        <p className={styles.muted}>Nothing parked.</p>
      )}
      {parking.data && parking.data.items.length > 0 && (
        <ul className={styles.parkingList}>
          {parking.data.items.map((item) => (
            <li key={item.id} className={styles.parkingItem}>
              <label className={item.done ? styles.doneText : undefined}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) => toggle.mutate({ id: item.id, done: e.target.checked })}
                />{" "}
                {item.text}
              </label>
              <button
                type="button"
                className={styles.ghost}
                aria-label={`Delete "${item.text}"`}
                onClick={() => remove.mutate(item.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
