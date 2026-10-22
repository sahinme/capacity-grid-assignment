package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

const maxWeeklyHours = 168 // hours in a week

type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

type updatePersonRequest struct {
	WeeklyHours *float64 `json:"weeklyHours"`
}

// handleUpdatePerson serves PATCH /api/people/{id} with {"weeklyHours": 32}.
//
// It returns the saved person, so the client can replace its optimistic value
// with what the database actually holds.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, apiError{"id must be a positive integer"})
		return
	}

	var req updatePersonRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil || req.WeeklyHours == nil {
		writeJSON(w, http.StatusBadRequest, apiError{`body must be like {"weeklyHours": 32}`})
		return
	}
	hours := *req.WeeklyHours
	if hours < 0 || hours > maxWeeklyHours {
		writeJSON(w, http.StatusBadRequest, apiError{
			fmt.Sprintf("weekly hours must be between 0 and %d", maxWeeklyHours),
		})
		return
	}

	var p person
	err = s.db.QueryRow(r.Context(),
		`UPDATE people SET weekly_hours = $2 WHERE id = $1
		 RETURNING id, name, weekly_hours::float8`,
		id, hours,
	).Scan(&p.ID, &p.Name, &p.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, apiError{"person not found"})
		return
	}
	if err != nil {
		log.Printf("update person %d: %v", id, err)
		writeJSON(w, http.StatusInternalServerError, apiError{"could not save weekly hours"})
		return
	}

	writeJSON(w, http.StatusOK, p)
}
