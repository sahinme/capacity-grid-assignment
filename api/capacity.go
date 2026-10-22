package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	dateLayout = "2006-01-02"
	// Two years of history, once the range is widened to whole weeks.
	maxWeeks = 106
)

// capacityResponse has one row per person and one column per week.
// Capacity is not repeated per week: the schema keeps a single weekly_hours
// per person, so the client derives each week's capacity from weeklyHours.
// That also means an edit only has to change one number on the client.
type capacityResponse struct {
	From   string           `json:"from"`  // Monday of the first week
	To     string           `json:"to"`    // Sunday of the last week
	Weeks  []string         `json:"weeks"` // Monday of each week, in order
	People []personCapacity `json:"people"`
}

type personCapacity struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	WeeklyHours float64   `json:"weeklyHours"`
	Allocated   []float64 `json:"allocated"` // hours per week, same order as Weeks
}

type apiError struct {
	Error string `json:"error"`
}

// capacityQuery returns every person with their allocated hours for each week
// from $1 to $2 (both Mondays), in week order. People with no assignments get
// zeros, so every row has one value per week.
//
// Only Monday to Friday count: hours_per_day is per working day, so a
// Monday-to-Sunday assignment at 8h/day is a 40h week, not 56h. In a week
// starting on Monday w the working days are w..w+4, so an assignment
// contributes the days where its own range overlaps w..w+4.
const capacityQuery = `
WITH weeks AS (
	SELECT $1::date + 7 * i AS week_start
	FROM generate_series(0, ($2::date - $1::date) / 7) AS i
),
allocated AS (
	SELECT a.person_id,
	       w.week_start,
	       sum(a.hours_per_day
	           * (LEAST(a.end_date, w.week_start + 4) - GREATEST(a.start_date, w.week_start) + 1)) AS hours
	FROM assignments a
	JOIN weeks w ON a.start_date <= w.week_start + 4 AND a.end_date >= w.week_start
	WHERE a.start_date <= $2::date + 4
	  AND a.end_date >= $1::date
	GROUP BY a.person_id, w.week_start
)
SELECT p.id,
       p.name,
       p.weekly_hours::float8,
       array_agg(COALESCE(al.hours, 0)::float8 ORDER BY w.week_start) AS allocated
FROM people p
CROSS JOIN weeks w
LEFT JOIN allocated al ON al.person_id = p.id AND al.week_start = w.week_start
GROUP BY p.id
ORDER BY p.name, p.id`

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// The range is widened to whole weeks (Monday to Sunday), because a partial
// week would compare a few days of allocation against a full week of
// capacity. The response says which range it actually covers.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	from, err := parseDate(r.URL.Query().Get("from"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{"from must be a date like 2026-01-05"})
		return
	}
	to, err := parseDate(r.URL.Query().Get("to"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiError{"to must be a date like 2026-01-05"})
		return
	}
	if to.Before(from) {
		writeJSON(w, http.StatusBadRequest, apiError{"to must not be before from"})
		return
	}

	firstWeek, lastWeek := mondayOf(from), mondayOf(to)
	weekCount := int(lastWeek.Sub(firstWeek).Hours()/(24*7)) + 1
	if weekCount > maxWeeks {
		writeJSON(w, http.StatusBadRequest, apiError{
			fmt.Sprintf("the range covers %d weeks; the maximum is %d", weekCount, maxWeeks),
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	rows, err := s.db.Query(ctx, capacityQuery, firstWeek, lastWeek)
	if err != nil {
		log.Printf("capacity query: %v", err)
		writeJSON(w, http.StatusInternalServerError, apiError{"could not load capacity"})
		return
	}
	people, err := pgx.CollectRows(rows, pgx.RowToStructByPos[personCapacity])
	if err != nil {
		log.Printf("capacity rows: %v", err)
		writeJSON(w, http.StatusInternalServerError, apiError{"could not load capacity"})
		return
	}
	if people == nil {
		people = []personCapacity{}
	}

	weeks := make([]string, weekCount)
	for i := range weeks {
		weeks[i] = firstWeek.AddDate(0, 0, 7*i).Format(dateLayout)
	}

	writeJSON(w, http.StatusOK, capacityResponse{
		From:   firstWeek.Format(dateLayout),
		To:     lastWeek.AddDate(0, 0, 6).Format(dateLayout),
		Weeks:  weeks,
		People: people,
	})
}

func parseDate(s string) (time.Time, error) {
	return time.Parse(dateLayout, s)
}

// mondayOf returns the Monday of the week d falls in (weeks run Monday to Sunday).
func mondayOf(d time.Time) time.Time {
	daysSinceMonday := (int(d.Weekday()) + 6) % 7
	return d.AddDate(0, 0, -daysSinceMonday)
}
